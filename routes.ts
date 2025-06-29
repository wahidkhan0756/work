import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import * as XLSX from 'xlsx';
import {
  insertSkuSchema,
  insertFabricRecordSchema,
  insertCuttingRecordSchema,
  insertProductionRecordSchema,
  insertFinishingRecordSchema,
  insertWarehouseRecordSchema,
  insertSalesRecordSchema,
  insertReturnRecordSchema,
  insertReturnProcessingSchema,
  insertUserInteractionSchema,
  insertWorkflowRecommendationSchema,
  insertUserPreferencesSchema,
  bulkSkuUploadSchema,
  type BulkUploadResult,
} from "@shared/schema";
import multer from 'multer';

// Flexible date parsing function that handles multiple formats and Excel serial dates
function parseFlexibleDate(dateInput: any): string | null {
  if (!dateInput) return null;
  
  // Handle Excel serial date numbers
  if (typeof dateInput === 'number' && dateInput > 25569) { // Excel epoch starts at 1900-01-01
    const excelEpoch = new Date(1900, 0, 1);
    const days = dateInput - 2; // Adjust for Excel's leap year bug and 0-indexing
    const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  
  const dateStr = dateInput.toString().trim();
  
  // Try different date formats
  const formats = [
    // ISO format: YYYY-MM-DD
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    // DD/MM/YYYY format
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // DD-MM-YYYY format
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  ];
  
  // Try ISO format first (YYYY-MM-DD)
  const isoMatch = dateStr.match(formats[0]);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime()) && date.getFullYear() == parseInt(year)) {
      return date.toISOString().split('T')[0];
    }
  }
  
  // Try DD/MM/YYYY or DD-MM-YYYY format
  const ddmmMatch = dateStr.match(formats[1]) || dateStr.match(formats[2]);
  if (ddmmMatch) {
    const [, day, month, year] = ddmmMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime()) && 
        date.getFullYear() == parseInt(year) &&
        date.getMonth() == parseInt(month) - 1 &&
        date.getDate() == parseInt(day)) {
      return date.toISOString().split('T')[0];
    }
  }
  
  // Try standard Date constructor as fallback
  const fallbackDate = new Date(dateStr);
  if (!isNaN(fallbackDate.getTime())) {
    return fallbackDate.toISOString().split('T')[0];
  }
  
  return null;
}

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Enable authentication
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Current user endpoint
  app.get('/api/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching current user:", error);
      res.status(500).json({ message: "Failed to fetch current user" });
    }
  });

  // SKU routes
  app.get("/api/skus", async (req, res) => {
    try {
      const skus = await storage.getAllSkus();
      res.json(skus);
    } catch (error) {
      console.error("Error fetching SKUs:", error);
      res.status(500).json({ message: "Failed to fetch SKUs" });
    }
  });

  // SKU status and flow tracking endpoint
  app.get("/api/skus-with-status",  async (req, res) => {
    try {
      const wipData = await storage.getWipTracker();
      const skusWithStatus = wipData.map((item: any) => ({
        id: item.skuId,
        sku: item.sku,
        productName: item.productName,
        fabricType: item.fabricType,
        currentStage: item.currentStage,
        fabricInStock: item.fabricInStock,
        piecesCut: item.piecesCut,
        piecesStitched: item.piecesStitched,
        piecesFinished: item.piecesFinished,
        warehouseStock: item.warehouseStock,
        piecesSold: item.piecesSold,
        canProceedToCutting: item.fabricInStock > 0,
        canProceedToProduction: item.piecesCut > 0,
        canProceedToFinishing: item.piecesStitched > 0,
        canProceedToWarehouse: item.piecesFinished > 0,
        canProceedToSales: item.warehouseStock > 0,
      }));
      res.json(skusWithStatus);
    } catch (error) {
      console.error("Error fetching SKUs with status:", error);
      res.status(500).json({ message: "Failed to fetch SKU status" });
    }
  });

  app.post("/api/skus",  async (req, res) => {
    try {
      const validatedData = insertSkuSchema.parse(req.body);
      
      // Normalize data: uppercase SKU and barcode
      validatedData.sku = validatedData.sku.toUpperCase();
      if (validatedData.barcode && validatedData.barcode.trim()) {
        validatedData.barcode = validatedData.barcode.toUpperCase();
      } else {
        // Set to null if empty to avoid constraint violations
        validatedData.barcode = null;
      }
      
      // Check for duplicate SKU (case-insensitive)
      const existingSku = await storage.getSkuBySku(validatedData.sku);
      if (existingSku) {
        return res.status(409).json({ 
          message: "SKU already exists", 
          field: "sku",
          details: `SKU '${validatedData.sku}' is already in use`
        });
      }

      // Check for duplicate barcode if provided (case-insensitive)
      if (validatedData.barcode) {
        const existingBarcode = await storage.getSkuByBarcode(validatedData.barcode);
        if (existingBarcode) {
          return res.status(409).json({ 
            message: "Barcode already exists", 
            field: "barcode",
            details: `Barcode '${validatedData.barcode}' is already in use`
          });
        }
      }

      const sku = await storage.createSku(validatedData);
      res.status(201).json(sku);
    } catch (error: any) {
      console.error("Error creating SKU:", error);
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid data provided", 
          details: error.errors 
        });
      }
      
      if (error.code === '23505') { // PostgreSQL unique constraint violation
        return res.status(409).json({ message: "SKU or barcode already exists" });
      }
      
      res.status(500).json({ message: "Failed to create SKU" });
    }
  });

  // Admin-only SKU edit route
  app.put("/api/skus/:id",  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Get user from database to check role
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const validatedData = insertSkuSchema.partial().parse(req.body);
      
      // Normalize data if provided
      if (validatedData.sku) {
        validatedData.sku = validatedData.sku.toUpperCase();
      }
      if (validatedData.barcode) {
        validatedData.barcode = validatedData.barcode.toUpperCase();
      }
      
      const updatedSku = await storage.updateSku(id, validatedData);
      
      // Log activity
      await storage.createActivityLog({
        skuId: id,
        module: 'sku',
        action: 'updated',
        description: `SKU ${updatedSku.sku} updated by Admin`,
        userId: user.id,
        newValues: validatedData
      });
      
      res.json(updatedSku);
    } catch (error: any) {
      console.error("Error updating SKU:", error);
      res.status(500).json({ message: "Failed to update SKU" });
    }
  });

  // Admin-only SKU delete route
  app.delete("/api/skus/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      
      // Check if user is admin
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const sku = await storage.getSkuById(id);
      if (!sku) {
        return res.status(404).json({ message: "SKU not found" });
      }
      
      await storage.deleteSku(id, user.id);
      
      res.json({ message: "SKU deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting SKU:", error);
      res.status(500).json({ message: "Failed to delete SKU" });
    }
  });

  // Bulk SKU upload route
  app.post("/api/skus/bulk-upload", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { skus: bulkSkuData } = req.body;
      
      if (!Array.isArray(bulkSkuData) || bulkSkuData.length === 0) {
        return res.status(400).json({ message: "No SKU data provided" });
      }

      const validationResults = [];
      const validSkus = [];
      
      // Validate each SKU entry
      for (let i = 0; i < bulkSkuData.length; i++) {
        const row = bulkSkuData[i];
        const errors = [];
        
        try {
          // Validate required fields
          if (!row.skuCode || !row.skuCode.trim()) {
            errors.push("SKU Code is required");
          }
          if (!row.skuName || !row.skuName.trim()) {
            errors.push("SKU Name is required");
          }
          
          if (errors.length === 0) {
            // Transform and normalize data
            const skuData = {
              sku: row.skuCode.toString().toUpperCase().trim(),
              productName: row.skuName.toString().trim(),
              fabricType: row.fabricType?.toString().trim() || null,
              category: row.category?.toString().trim() || null,
              size: row.size?.toString().trim() || null,
              color: row.color?.toString().trim() || null,
              price: row.price ? parseFloat(row.price.toString()) : null,
              avgConsumption: row.avgConsumption ? parseFloat(row.avgConsumption.toString()) : null,
              barcode: null // Will be auto-generated
            };
            
            validSkus.push(skuData);
            validationResults.push({ row: i + 1, valid: true, data: skuData });
          } else {
            validationResults.push({ row: i + 1, valid: false, errors, data: row });
          }
        } catch (error) {
          validationResults.push({ row: i + 1, valid: false, errors: ["Invalid data format"], data: row });
        }
      }

      // Check for duplicate SKU codes within the upload
      const skuCodes = validSkus.map(s => s.sku);
      const duplicatesInUpload = skuCodes.filter((code, index) => skuCodes.indexOf(code) !== index);
      
      // Check for existing SKU codes in database
      const existingSkus = skuCodes.length > 0 ? await storage.validateSkuCodes(skuCodes) : [];
      
      // Mark validation errors for duplicates
      validationResults.forEach(result => {
        if (result.valid && result.data.sku) {
          if (duplicatesInUpload.includes(result.data.sku)) {
            result.valid = false;
            result.errors = result.errors || [];
            result.errors.push("Duplicate SKU code in upload");
          } else if (existingSkus.includes(result.data.sku)) {
            result.valid = false;
            result.errors = result.errors || [];
            result.errors.push("SKU code already exists in database");
          }
        }
      });

      const validEntries = validationResults.filter(r => r.valid).map(r => r.data);
      const invalidEntries = validationResults.filter(r => !r.valid);

      let createdSkus = [];
      let creationErrors = [];

      // Create valid SKUs
      if (validEntries.length > 0) {
        try {
          const result = await storage.bulkCreateSkus(validEntries);
          createdSkus = result.success;
          creationErrors = result.failed.map(f => ({
            row: validationResults.findIndex(r => r.data?.sku === f.sku.sku) + 1,
            errors: [f.error],
            data: f.sku
          }));
        } catch (error: any) {
          console.error("Bulk create error:", error);
          return res.status(500).json({ message: "Failed to create SKUs" });
        }
      }

      // Log bulk upload activity
      await storage.createActivityLog({
        skuId: null,
        module: 'sku',
        action: 'bulk_upload',
        description: `Bulk uploaded ${createdSkus.length} SKUs from ${bulkSkuData.length} rows`,
        userId: user.id,
        newValues: { 
          totalRows: bulkSkuData.length,
          successCount: createdSkus.length,
          errorCount: invalidEntries.length + creationErrors.length
        }
      });

      const response: BulkUploadResult = {
        success: true,
        totalRows: bulkSkuData.length,
        successCount: createdSkus.length,
        errorCount: invalidEntries.length + creationErrors.length,
        errors: [...invalidEntries, ...creationErrors],
        duplicateSkus: [...duplicatesInUpload, ...existingSkus]
      };

      res.json(response);
    } catch (error: any) {
      console.error("Error in bulk SKU upload:", error);
      res.status(500).json({ message: "Failed to process bulk upload" });
    }
  });

  // Sample template download route
  app.get("/api/skus/sample-template", (req, res) => {
    try {
      const sampleData = [
        {
          "SKU Code": "EXAMPLE001",
          "SKU Name": "Sample Product 1",
          "Category": "Clothing",
          "Fabric Type": "Cotton",
          "Size": "M",
          "Color": "Blue",
          "Price": "29.99",
          "Avg Consumption": "0.5"
        },
        {
          "SKU Code": "EXAMPLE002", 
          "SKU Name": "Sample Product 2",
          "Category": "Clothing",
          "Fabric Type": "Rayon",
          "Size": "L",
          "Color": "Red",
          "Price": "35.50",
          "Avg Consumption": "0.6"
        }
      ];

      const worksheet = XLSX.utils.json_to_sheet(sampleData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "SKU Template");
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Disposition', 'attachment; filename=sku-template.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (error) {
      console.error("Error generating template:", error);
      res.status(500).json({ message: "Failed to generate template" });
    }
  });

  // Fabric records routes
  app.get("/api/fabric-records",  async (req, res) => {
    try {
      const records = await storage.getAllFabricRecords();
      res.json(records);
    } catch (error) {
      console.error("Error fetching fabric records:", error);
      res.status(500).json({ message: "Failed to fetch fabric records" });
    }
  });

  app.post("/api/fabric-records",  async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertFabricRecordSchema.parse({
        ...req.body,
        totalMeters: parseFloat(req.body.totalMeters || "0").toString(),
        metersReceived: parseFloat(req.body.metersReceived || req.body.totalMeters || "0"),
        fabricWidth: parseFloat(req.body.fabricWidth || "0"),
        createdBy: userId,
      });
      
      // Verify SKU exists
      const sku = await storage.getSkuById(validatedData.skuId);
      if (!sku) {
        return res.status(404).json({ message: "SKU not found" });
      }
      
      const record = await storage.createFabricRecord(validatedData);
      
      // Log activity
      await storage.createActivityLog({
        skuId: validatedData.skuId,
        userId: userId,
        module: "fabric",
        action: "fabric_received",
        description: `${validatedData.metersReceived}m fabric received`,
      });
      
      res.status(201).json(record);
    } catch (error: any) {
      console.error("Error creating fabric record:", error);
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid data provided", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ message: "Failed to create fabric record" });
    }
  });

  // Admin-only fabric record edit route
  app.put("/api/fabric-records/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const validatedData = insertFabricRecordSchema.partial().parse(req.body);
      const updatedRecord = await storage.updateFabricRecord(id, validatedData);
      
      // Log activity
      await storage.createActivityLog({
        skuId: updatedRecord.skuId,
        module: 'fabric',
        action: 'updated',
        description: `Fabric record updated by Admin`,
        userId: userId,
        newValues: validatedData
      });
      
      res.json(updatedRecord);
    } catch (error: any) {
      console.error("Error updating fabric record:", error);
      res.status(500).json({ message: "Failed to update fabric record" });
    }
  });

  // Admin-only fabric record delete route
  app.delete("/api/fabric-records/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      await storage.deleteFabricRecord(id);
      
      // Log activity
      await storage.createActivityLog({
        module: 'fabric',
        action: 'deleted',
        description: `Fabric record deleted by Admin`,
        userId: user.id
      });
      
      res.json({ message: "Fabric record deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting fabric record:", error);
      res.status(500).json({ message: "Failed to delete fabric record" });
    }
  });

  // Fabric stock routes (calculated available fabric)
  app.get("/api/fabric-stock",  async (req, res) => {
    try {
      const fabricStock = await storage.getFabricStock();
      res.json(fabricStock);
    } catch (error) {
      console.error("Error fetching fabric stock:", error);
      res.status(500).json({ message: "Failed to fetch fabric stock" });
    }
  });

  // Cutting records routes
  app.get("/api/cutting-records",  async (req, res) => {
    try {
      const records = await storage.getAllCuttingRecords();
      res.json(records);
    } catch (error) {
      console.error("Error fetching cutting records:", error);
      res.status(500).json({ message: "Failed to fetch cutting records" });
    }
  });

  app.post("/api/cutting-records",  async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertCuttingRecordSchema.parse({
        ...req.body,
        createdBy: userId,
      });
      
      // Verify SKU exists
      const sku = await storage.getSkuById(validatedData.skuId);
      if (!sku) {
        return res.status(404).json({ message: "SKU not found" });
      }
      
      // Validate fabric availability before cutting
      const fabricStock = await storage.getFabricStock();
      const skuFabricStock = fabricStock.find(stock => stock.skuId === validatedData.skuId);
      
      if (!skuFabricStock || parseFloat(skuFabricStock.availableMeters) <= 0) {
        return res.status(400).json({ 
          message: "Cannot proceed with cutting: No fabric available for this SKU. Please add fabric first in Fabric Management." 
        });
      }
      
      const fabricNeeded = parseFloat(validatedData.totalFabricUsed);
      if (fabricNeeded > parseFloat(skuFabricStock.availableMeters)) {
        return res.status(400).json({ 
          message: `Insufficient fabric. Available: ${skuFabricStock.availableMeters}m, Required: ${fabricNeeded}m` 
        });
      }
      
      const record = await storage.createCuttingRecord(validatedData);
      
      // Log activity
      await storage.createActivityLog({
        skuId: validatedData.skuId,
        userId: userId,
        module: "cutting",
        action: "cutting_completed",
        description: `${validatedData.totalPiecesCut} pieces cut from ${validatedData.totalFabricUsed}m fabric`,
      });
      
      res.status(201).json(record);
    } catch (error: any) {
      console.error("Error creating cutting record:", error);
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid data provided", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ message: "Failed to create cutting record" });
    }
  });

  // Admin-only cutting record edit route
  app.put("/api/cutting-records/:id",  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as any;
      
      if (user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const validatedData = insertCuttingRecordSchema.partial().parse(req.body);
      const updatedRecord = await storage.updateCuttingRecord(id, validatedData);
      
      // Log activity
      await storage.createActivityLog({
        skuId: updatedRecord.skuId,
        module: 'cutting',
        action: 'updated',
        description: `Cutting record updated by Admin`,
        userId: user.id,
        newValues: validatedData
      });
      
      res.json(updatedRecord);
    } catch (error: any) {
      console.error("Error updating cutting record:", error);
      res.status(500).json({ message: "Failed to update cutting record" });
    }
  });

  // Admin-only cutting record delete route
  app.delete("/api/cutting-records/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      await storage.deleteCuttingRecord(id);
      
      // Log activity
      await storage.createActivityLog({
        module: 'cutting',
        action: 'deleted',
        description: `Cutting record deleted by Admin`,
        userId: user.id
      });
      
      res.json({ message: "Cutting record deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting cutting record:", error);
      res.status(500).json({ message: "Failed to delete cutting record" });
    }
  });

  // Production records routes
  app.get("/api/production-records",  async (req, res) => {
    try {
      const records = await storage.getAllProductionRecords();
      res.json(records);
    } catch (error) {
      console.error("Error fetching production records:", error);
      res.status(500).json({ message: "Failed to fetch production records" });
    }
  });

  app.post("/api/production-records",  async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Pre-condition check: Ensure cutting records exist for this SKU
      const { skuId, totalStitched } = req.body;
      
      if (!skuId) {
        return res.status(400).json({ message: "SKU is required" });
      }
      
      // Check if cutting records exist for this SKU
      const cuttingRecords = await storage.getAllCuttingRecords();
      const skuCuttingRecords = cuttingRecords.filter(record => record.skuId === parseInt(skuId));
      
      if (skuCuttingRecords.length === 0) {
        return res.status(400).json({ 
          message: "Please complete cutting for this SKU before recording production." 
        });
      }
      
      // Calculate available pieces for production
      const totalCut = skuCuttingRecords.reduce((sum, record) => sum + record.totalPiecesCut, 0);
      const productionRecords = await storage.getAllProductionRecords();
      const skuProductionRecords = productionRecords.filter(record => record.skuId === parseInt(skuId));
      const totalProduced = skuProductionRecords.reduce((sum, record) => sum + record.totalStitched, 0);
      const availableForProduction = totalCut - totalProduced;
      
      const requestedProduction = parseInt(totalStitched || '0');
      
      if (requestedProduction > availableForProduction) {
        return res.status(400).json({ 
          message: `Cannot stitch ${requestedProduction} pieces. Only ${availableForProduction} pieces available from cutting.` 
        });
      }
      
      const validatedData = insertProductionRecordSchema.parse({
        ...req.body,
        createdBy: userId,
      });
      
      const record = await storage.createProductionRecord(validatedData);
      res.status(201).json(record);
    } catch (error: any) {
      console.error("Error creating production record:", error);
      
      // Handle validation errors
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Missing or invalid data. Please review your inputs.",
          details: error.errors 
        });
      }
      
      res.status(500).json({ 
        message: error.message || "Failed to create production record" 
      });
    }
  });

  // Admin-only production record edit route
  app.put("/api/production-records/:id",  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as any;
      
      if (user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const validatedData = insertProductionRecordSchema.partial().parse(req.body);
      const updatedRecord = await storage.updateProductionRecord(id, validatedData);
      
      // Log activity
      await storage.createActivityLog({
        skuId: updatedRecord.skuId,
        module: 'production',
        action: 'updated',
        description: `Production record updated by Admin`,
        userId: user.id,
        newValues: validatedData
      });
      
      res.json(updatedRecord);
    } catch (error: any) {
      console.error("Error updating production record:", error);
      res.status(500).json({ message: "Failed to update production record" });
    }
  });

  // Admin-only production record delete route
  app.delete("/api/production-records/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      await storage.deleteProductionRecord(id);
      
      // Log activity
      await storage.createActivityLog({
        module: 'production',
        action: 'deleted',
        description: `Production record deleted by Admin`,
        userId: user.id
      });
      
      res.json({ message: "Production record deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting production record:", error);
      res.status(500).json({ message: "Failed to delete production record" });
    }
  });

  // Finishing records routes
  app.get("/api/finishing-records",  async (req, res) => {
    try {
      const records = await storage.getAllFinishingRecords();
      res.json(records);
    } catch (error) {
      console.error("Error fetching finishing records:", error);
      res.status(500).json({ message: "Failed to fetch finishing records" });
    }
  });

  app.post("/api/finishing-records",  async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Pre-condition check: Ensure production records exist for this SKU
      const { skuId, finishedPieces, rejectedPieces } = req.body;
      
      if (!skuId) {
        return res.status(400).json({ message: "SKU is required" });
      }
      
      // Check if production records exist for this SKU
      const productionRecords = await storage.getAllProductionRecords();
      const skuProductionRecords = productionRecords.filter(record => record.skuId === parseInt(skuId));
      
      if (skuProductionRecords.length === 0) {
        return res.status(400).json({ 
          message: "Please complete production before submitting finishing data." 
        });
      }
      
      // Calculate available pieces for finishing
      const totalStitched = skuProductionRecords.reduce((sum, record) => sum + record.totalStitched, 0);
      const finishingRecords = await storage.getAllFinishingRecords();
      const skuFinishingRecords = finishingRecords.filter(record => record.skuId === parseInt(skuId));
      const totalFinished = skuFinishingRecords.reduce((sum, record) => sum + record.finishedPieces + record.rejectedPieces, 0);
      const availableForFinishing = totalStitched - totalFinished;
      
      const requestedTotal = parseInt(finishedPieces || '0') + parseInt(rejectedPieces || '0');
      
      if (requestedTotal > availableForFinishing) {
        return res.status(400).json({ 
          message: `Cannot finish ${requestedTotal} pieces. Only ${availableForFinishing} pieces available from production.` 
        });
      }
      
      const validatedData = insertFinishingRecordSchema.parse({
        ...req.body,
        createdBy: userId,
      });
      
      const record = await storage.createFinishingRecord(validatedData);
      res.status(201).json(record);
    } catch (error: any) {
      console.error("Error creating finishing record:", error);
      
      // Handle validation errors
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Missing or invalid data. Please review your inputs.",
          details: error.errors 
        });
      }
      
      res.status(500).json({ 
        message: error.message || "Failed to create finishing record" 
      });
    }
  });

  // Admin-only finishing record edit route
  app.put("/api/finishing-records/:id",  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as any;
      
      if (user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const validatedData = insertFinishingRecordSchema.partial().parse(req.body);
      const updatedRecord = await storage.updateFinishingRecord(id, validatedData);
      
      // Log activity
      await storage.createActivityLog({
        skuId: updatedRecord.skuId,
        module: 'finishing',
        action: 'updated',
        description: `Finishing record updated by Admin`,
        userId: user.id,
        newValues: validatedData
      });
      
      res.json(updatedRecord);
    } catch (error: any) {
      console.error("Error updating finishing record:", error);
      res.status(500).json({ message: "Failed to update finishing record" });
    }
  });

  // Admin-only finishing record delete route
  app.delete("/api/finishing-records/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      await storage.deleteFinishingRecord(id);
      
      // Log activity
      await storage.createActivityLog({
        module: 'finishing',
        action: 'deleted',
        description: `Finishing record deleted by Admin`,
        userId: user.id
      });
      
      res.json({ message: "Finishing record deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting finishing record:", error);
      res.status(500).json({ message: "Failed to delete finishing record" });
    }
  });

  // Warehouse records routes
  app.get("/api/warehouse-records",  async (req, res) => {
    try {
      const records = await storage.getAllWarehouseRecords();
      res.json(records);
    } catch (error) {
      console.error("Error fetching warehouse records:", error);
      res.status(500).json({ message: "Failed to fetch warehouse records" });
    }
  });

  app.post("/api/warehouse-records",  async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Pre-condition check: Ensure finishing records exist for this SKU
      const { skuId, quantityReceived } = req.body;
      
      if (!skuId) {
        return res.status(400).json({ message: "SKU is required" });
      }
      
      // Check if finishing records exist for this SKU
      const finishingRecords = await storage.getAllFinishingRecords();
      const skuFinishingRecords = finishingRecords.filter(record => record.skuId === parseInt(skuId));
      
      if (skuFinishingRecords.length === 0) {
        return res.status(400).json({ 
          message: "Please complete finishing before submitting warehouse data." 
        });
      }
      
      // Calculate available pieces for warehouse
      const totalFinished = skuFinishingRecords.reduce((sum, record) => sum + record.finishedPieces, 0);
      const warehouseRecords = await storage.getAllWarehouseRecords();
      const skuWarehouseRecords = warehouseRecords.filter(record => record.skuId === parseInt(skuId));
      const totalInWarehouse = skuWarehouseRecords.reduce((sum, record) => sum + record.quantityReceived, 0);
      const availableForWarehouse = totalFinished - totalInWarehouse;
      
      const requestedQuantity = parseInt(quantityReceived || '0');
      
      if (requestedQuantity > availableForWarehouse) {
        return res.status(400).json({ 
          message: `Cannot receive ${requestedQuantity} pieces. Only ${availableForWarehouse} pieces available from finishing.` 
        });
      }
      
      const validatedData = insertWarehouseRecordSchema.parse({
        ...req.body,
        receivedDate: req.body.receivedDate || new Date().toISOString().split('T')[0],
        storageLocation: req.body.storageLocation || null,
        createdBy: userId,
      });
      
      const record = await storage.createWarehouseRecord(validatedData);
      res.status(201).json(record);
    } catch (error: any) {
      console.error("Error creating warehouse record:", error);
      
      // Handle validation errors
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Missing or invalid data. Please review your inputs.",
          details: error.errors 
        });
      }
      
      res.status(500).json({ 
        message: error.message || "Failed to create warehouse record" 
      });
    }
  });

  // Admin-only warehouse record edit route
  app.put("/api/warehouse-records/:id",  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as any;
      
      if (user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const validatedData = insertWarehouseRecordSchema.partial().parse(req.body);
      const updatedRecord = await storage.updateWarehouseRecord(id, validatedData);
      
      // Log activity
      await storage.createActivityLog({
        skuId: updatedRecord.skuId,
        module: 'warehouse',
        action: 'updated',
        description: `Warehouse record updated by Admin`,
        userId: user.id,
        newValues: validatedData
      });
      
      res.json(updatedRecord);
    } catch (error: any) {
      console.error("Error updating warehouse record:", error);
      res.status(500).json({ message: "Failed to update warehouse record" });
    }
  });

  // Admin-only warehouse record delete route
  app.delete("/api/warehouse-records/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      await storage.deleteWarehouseRecord(id);
      
      // Log activity
      await storage.createActivityLog({
        module: 'warehouse',
        action: 'deleted',
        description: `Warehouse record deleted by Admin`,
        userId: user.id
      });
      
      res.json({ message: "Warehouse record deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting warehouse record:", error);
      res.status(500).json({ message: "Failed to delete warehouse record" });
    }
  });

  // Warehouse stock routes (calculated available inventory)
  app.get("/api/warehouse-stock",  async (req, res) => {
    try {
      const warehouseStock = await storage.getWarehouseStock();
      res.json(warehouseStock);
    } catch (error) {
      console.error("Error fetching warehouse stock:", error);
      res.status(500).json({ message: "Failed to fetch warehouse stock" });
    }
  });

  // Sales records routes
  app.get("/api/sales-records",  async (req, res) => {
    try {
      const records = await storage.getAllSalesRecords();
      res.json(records);
    } catch (error) {
      console.error("Error fetching sales records:", error);
      res.status(500).json({ message: "Failed to fetch sales records" });
    }
  });

  app.post("/api/sales-records",  async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Pre-condition check: Ensure warehouse stock exists for this SKU
      const { skuId, quantitySold } = req.body;
      
      if (!skuId) {
        return res.status(400).json({ message: "SKU is required" });
      }
      
      // Check if warehouse records exist for this SKU
      const warehouseRecords = await storage.getAllWarehouseRecords();
      const skuWarehouseRecords = warehouseRecords.filter(record => record.skuId === parseInt(skuId));
      
      if (skuWarehouseRecords.length === 0) {
        return res.status(400).json({ 
          message: "Please add warehouse stock for this SKU before recording sales." 
        });
      }
      
      // Calculate available warehouse stock
      const totalInWarehouse = skuWarehouseRecords.reduce((sum, record) => sum + record.quantityReceived, 0);
      const salesRecords = await storage.getAllSalesRecords();
      const skuSalesRecords = salesRecords.filter(record => record.skuId === parseInt(skuId));
      const totalSold = skuSalesRecords.reduce((sum, record) => sum + record.quantitySold, 0);
      const availableStock = totalInWarehouse - totalSold;
      
      const requestedQuantity = parseInt(quantitySold || '0');
      
      if (requestedQuantity > availableStock) {
        return res.status(400).json({ 
          message: `Cannot sell ${requestedQuantity} pieces. Only ${availableStock} pieces available in warehouse.` 
        });
      }
      
      const validatedData = insertSalesRecordSchema.parse({
        ...req.body,
        saleDate: req.body.saleDate || new Date().toISOString().split('T')[0],
        createdBy: userId,
      });
      
      const record = await storage.createSalesRecord(validatedData);
      res.status(201).json(record);
    } catch (error: any) {
      console.error("Error creating sales record:", error);
      
      // Handle validation errors
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Missing or invalid data. Please review your inputs.",
          details: error.errors 
        });
      }
      
      res.status(500).json({ 
        message: error.message || "Failed to create sales record" 
      });
    }
  });

  // Admin-only sales record edit route
  app.put("/api/sales-records/:id",  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as any;
      
      if (user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const validatedData = insertSalesRecordSchema.partial().parse(req.body);
      const updatedRecord = await storage.updateSalesRecord(id, validatedData);
      
      // Log activity
      await storage.createActivityLog({
        skuId: updatedRecord.skuId,
        module: 'sales',
        action: 'updated',
        description: `Sales record updated by Admin`,
        userId: user.id,
        newValues: validatedData
      });
      
      res.json(updatedRecord);
    } catch (error: any) {
      console.error("Error updating sales record:", error);
      res.status(500).json({ message: "Failed to update sales record" });
    }
  });

  // Admin-only sales record delete route
  app.delete("/api/sales-records/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      await storage.deleteSalesRecord(id);
      
      // Log activity
      await storage.createActivityLog({
        module: 'sales',
        action: 'deleted',
        description: `Sales record deleted by Admin`,
        userId: user.id
      });
      
      res.json({ message: "Sales record deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting sales record:", error);
      res.status(500).json({ message: "Failed to delete sales record" });
    }
  });

  // Inventory routes
  app.get("/api/inventory-summary",  async (req, res) => {
    try {
      const summary = await storage.getInventorySummary();
      res.json(summary);
    } catch (error) {
      console.error("Error fetching inventory summary:", error);
      res.status(500).json({ message: "Failed to fetch inventory summary" });
    }
  });

  app.get("/api/overview-stats",  async (req, res) => {
    try {
      const stats = await storage.getOverviewStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching overview stats:", error);
      res.status(500).json({ message: "Failed to fetch overview stats" });
    }
  });

  // User Management routes
  app.get("/api/users",  async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/users",  async (req, res) => {
    try {
      const userData = req.body;
      
      // Validate required fields
      if (!userData.username || !userData.email || !userData.role) {
        return res.status(400).json({ 
          message: "Missing required fields: username, email, and role are required" 
        });
      }

      // Check if user with this email already exists
      const existingUsers = await storage.getAllUsers();
      const existingUser = existingUsers.find(user => user.email === userData.email);
      if (existingUser) {
        return res.status(409).json({ 
          message: "A user with this email address already exists" 
        });
      }

      const user = await storage.createUser(userData);
      res.status(201).json(user);
    } catch (error: any) {
      console.error("Error creating user:", error);
      
      // Handle database constraint violations
      if (error.code === '23505' && error.constraint === 'users_email_unique') {
        return res.status(409).json({ 
          message: "A user with this email address already exists" 
        });
      }
      
      res.status(500).json({ 
        message: "Failed to create user. Please try again." 
      });
    }
  });

  app.put("/api/users/:id",  async (req, res) => {
    try {
      const userId = req.params.id;
      const userData = req.body;
      const user = await storage.updateUser(userId, userData);
      res.json(user);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id",  async (req, res) => {
    try {
      const userId = req.params.id;
      await storage.deleteUser(userId);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Bulk Import routes
  app.post("/api/bulk-import/preview",  upload.single('file'), async (req: any, res) => {
    try {
      const file = req.file;
      const importType = req.body.importType;
      
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      let workbook: XLSX.WorkBook;
      
      // Parse file based on extension
      if (file.mimetype === 'text/csv') {
        const csvData = file.buffer.toString('utf8');
        workbook = XLSX.read(csvData, { type: 'string' });
      } else {
        workbook = XLSX.read(file.buffer, { type: 'buffer' });
      }

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (rawData.length === 0) {
        return res.status(400).json({ message: "File is empty" });
      }

      const headers = rawData[0] as string[];
      const dataRows = rawData.slice(1).filter((row: any) => Array.isArray(row) && row.length > 0);

      // Convert rows to objects
      const data = dataRows.map((row: any) => {
        const obj: any = {};
        if (Array.isArray(row)) {
          headers.forEach((header, index) => {
            obj[header] = row[index] || '';
          });
        }
        return obj;
      });

      const validationErrors: string[] = [];
      const validatedData: any[] = [];

      // Get all SKUs for validation
      const allSkus = await storage.getAllSkus();
      const warehouseStock = await storage.getWarehouseStock();

      if (importType === 'sales-import') {
        // Validate sales import data
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const rowNum = i + 2; // Account for header row
          
          // Required fields validation
          if (!row['SKU'] || !row['Quantity'] || !row['Sale Date']) {
            validationErrors.push(`Row ${rowNum}: SKU, Quantity, and Sale Date are required`);
            continue;
          }

          // SKU exists validation
          const sku = allSkus.find(s => s.sku === row['SKU']);
          if (!sku) {
            validationErrors.push(`Row ${rowNum}: SKU '${row['SKU']}' does not exist`);
            continue;
          }

          // Quantity validation
          const quantity = parseInt(row['Quantity']);
          if (isNaN(quantity) || quantity <= 0) {
            validationErrors.push(`Row ${rowNum}: Quantity must be a positive number`);
            continue;
          }

          // Stock availability validation
          const stock = warehouseStock.find(s => s.skuId === sku.id);
          if (!stock || stock.availableQuantity < quantity) {
            validationErrors.push(`Row ${rowNum}: Insufficient stock for SKU '${row['SKU']}'. Available: ${stock?.availableQuantity || 0}, Required: ${quantity}`);
            continue;
          }

          // Date validation with multiple format support
          const parsedDate = parseFlexibleDate(row['Sale Date']);
          if (!parsedDate) {
            validationErrors.push(`Row ${rowNum}: Invalid sale date format. Use YYYY-MM-DD, DD/MM/YYYY, or DD-MM-YYYY`);
            continue;
          }

          // Unit price validation (if provided)
          let unitPrice = null;
          if (row['Unit Price']) {
            unitPrice = parseFloat(row['Unit Price']);
            if (isNaN(unitPrice)) {
              validationErrors.push(`Row ${rowNum}: Invalid unit price format`);
              continue;
            }
          }

          // Add validated row
          validatedData.push({
            skuId: sku.id,
            quantitySold: quantity,
            platformName: row['Sale Channel'] || row['Platform'] || 'Bulk Import',
            orderId: row['Order ID'] || row['Invoice Number'] || null,
            unitPrice: unitPrice ? unitPrice.toString() : null,
            totalAmount: unitPrice ? (unitPrice * quantity).toString() : null,
            saleDate: parsedDate,
            customerName: row['Customer Name'] || null,
          });
        }
      }

      const preview = {
        data: validatedData,
        headers: headers,
        validationErrors: validationErrors
      };

      res.json(preview);
    } catch (error) {
      console.error("Error processing file:", error);
      res.status(500).json({ message: "Failed to process file" });
    }
  });

  app.post("/api/bulk-import/confirm",  async (req: any, res) => {
    try {
      const { importType, data } = req.body;
      const userId = req.user.claims.sub;
      
      let result = { total: data.length, success: 0, failed: 0, errors: [] };
      
      for (const record of data) {
        try {
          if (importType === 'sku-import') {
            await storage.createSku({
              ...record,
              createdBy: userId
            });
          } else if (importType === 'fabric-import') {
            await storage.createFabricRecord({
              ...record,
              createdBy: userId
            });
          } else if (importType === 'sales-import') {
            // Create sales record with proper validation
            await storage.createSalesRecord({
              ...record,
              createdBy: userId
            });
          } else if (importType === 'return-import') {
            // Create return record with proper validation
            await storage.createReturnRecord({
              ...record,
              createdBy: userId
            });
          }
          result.success++;
        } catch (error: any) {
          result.failed++;
          result.errors.push(`Row ${result.success + result.failed}: ${error.message || 'Unknown error'}`);
        }
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error importing data:", error);
      res.status(500).json({ message: "Failed to import data" });
    }
  });

  // WIP Tracker routes
  app.get("/api/wip-tracker", async (req, res) => {
    try {
      const wipData = await storage.getWipTracker();
      res.json(wipData);
    } catch (error) {
      console.error("Error fetching WIP tracker data:", error);
      res.status(500).json({ message: "Failed to fetch WIP tracker data" });
    }
  });

  // Activity logs routes
  app.get("/api/activity-logs", async (req, res) => {
    try {
      const skuId = req.query.skuId ? parseInt(req.query.skuId as string) : undefined;
      const logs = await storage.getActivityLogs(skuId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ message: "Failed to fetch activity logs" });
    }
  });

  // Inventory summary routes
  app.get("/api/inventory-summary", async (req, res) => {
    try {
      const summary = await storage.getInventorySummary();
      res.json(summary);
    } catch (error) {
      console.error("Error fetching inventory summary:", error);
      res.status(500).json({ message: "Failed to fetch inventory summary" });
    }
  });

  // Overview stats routes
  app.get("/api/overview-stats", async (req, res) => {
    try {
      const stats = await storage.getOverviewStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching overview stats:", error);
      res.status(500).json({ message: "Failed to fetch overview stats" });
    }
  });

  // Return Management routes
  app.get("/api/return-records", async (req, res) => {
    try {
      const returnRecords = await storage.getAllReturnRecords();
      res.json(returnRecords);
    } catch (error) {
      console.error("Error fetching return records:", error);
      res.status(500).json({ message: "Failed to fetch return records" });
    }
  });

  app.post("/api/return-records", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check for duplicate order ID
      const orderIdExists = await storage.checkOrderIdExists(req.body.orderId);
      if (orderIdExists) {
        return res.status(400).json({ 
          message: "Order ID already exists. Duplicate returns are not allowed." 
        });
      }

      const validatedData = insertReturnRecordSchema.parse({
        ...req.body,
        createdBy: userId,
        returnDate: req.body.returnDate || new Date().toISOString().split('T')[0]
      });

      const returnRecord = await storage.createReturnRecord(validatedData);
      
      // If return condition is "saleable", automatically add back to warehouse stock
      if (validatedData.returnCondition === "saleable") {
        try {
          const warehouseRecord = await storage.createWarehouseRecord({
            skuId: validatedData.skuId,
            quantityReceived: validatedData.quantity,
            storageLocation: `Return via ${validatedData.returnSourcePanel}`,
            receivedDate: validatedData.returnDate || new Date().toISOString().split('T')[0],
            createdBy: userId,
            returnId: returnRecord.id
          });
          
          // Log the warehouse addition activity
          await storage.createActivityLog({
            skuId: validatedData.skuId,
            module: "warehouse",
            action: "add_stock_from_return",
            description: `Added ${validatedData.quantity} pieces back to warehouse from saleable return (Order: ${validatedData.orderId})`,
            userId: userId
          });
        } catch (warehouseError) {
          console.error("Error adding saleable return to warehouse:", warehouseError);
          // Don't fail the return creation if warehouse update fails
        }
      }
      
      res.json(returnRecord);
    } catch (error: any) {
      console.error("Error creating return record:", error);
      res.status(500).json({ 
        message: error.message || "Failed to create return record" 
      });
    }
  });

  app.put("/api/return-records/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      // Only admin can edit return records
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Only admin can edit return records" });
      }

      const validatedData = insertReturnRecordSchema.partial().parse({
        ...req.body,
        createdBy: userId
      });

      const returnRecord = await storage.updateReturnRecord(id, validatedData);
      res.json(returnRecord);
    } catch (error: any) {
      console.error("Error updating return record:", error);
      res.status(500).json({ 
        message: error.message || "Failed to update return record" 
      });
    }
  });

  // Admin-only return record delete route
  app.delete("/api/return-records/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      await storage.deleteReturnRecord(id);
      
      // Log activity
      await storage.createActivityLog({
        module: 'returns',
        action: 'deleted',
        description: `Return record deleted by Admin`,
        userId: user.id
      });
      
      res.json({ message: "Return record deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting return record:", error);
      res.status(500).json({ message: "Failed to delete return record" });
    }
  });

  app.delete("/api/return-records/:id", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Only admin can delete return records
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Only admin can delete return records" });
      }

      await storage.deleteReturnRecord(id);
      res.json({ message: "Return record deleted successfully" });
    } catch (error) {
      console.error("Error deleting return record:", error);
      res.status(500).json({ message: "Failed to delete return record" });
    }
  });

  // Return Processing routes
  app.get("/api/return-processing", async (req, res) => {
    try {
      const returnProcessing = await storage.getAllReturnProcessing();
      res.json(returnProcessing);
    } catch (error) {
      console.error("Error fetching return processing:", error);
      res.status(500).json({ message: "Failed to fetch return processing" });
    }
  });

  app.get("/api/pending-returns-refinishing", async (req, res) => {
    try {
      const pendingReturns = await storage.getPendingReturnsForRefinishing();
      res.json(pendingReturns);
    } catch (error) {
      console.error("Error fetching pending returns for refinishing:", error);
      res.status(500).json({ message: "Failed to fetch pending returns for refinishing" });
    }
  });

  // Mark return as refinished (Admin/QC only)
  app.post("/api/return-processing/mark-refinished", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Role-based access: only Admin and QC team can mark as refinished
      if (user?.role !== 'admin' && user?.role !== 'qc_team') {
        return res.status(403).json({ message: "Only Admin or QC team can mark returns as refinished" });
      }
      
      const { returnId, notes } = req.body;
      
      // Get the return record
      const returnRecord = await storage.getReturnRecord(returnId);
      if (!returnRecord) {
        return res.status(404).json({ message: "Return record not found" });
      }
      
      // Create finishing record with "Return" source
      const finishingRecord = await storage.createFinishingRecord({
        skuId: returnRecord.skuId,
        finishedPieces: returnRecord.quantity,
        rejectedPieces: 0,
        finishingDate: new Date().toISOString().split('T')[0],
        source: "Return",
        tags: "Refinished",
        createdBy: userId
      });
      
      // Update return processing status
      await storage.updateReturnProcessingByReturnId(returnId, {
        status: "refinished",
        processedBy: userId,
        processedDate: new Date(),
        notes: notes || "Marked as refinished and sent to finishing",
        finishingRecordId: finishingRecord.id
      });
      
      // Log activity
      await storage.createActivityLog({
        skuId: returnRecord.skuId,
        module: 'returns',
        action: 'refinished',
        description: `Return ${returnRecord.orderId} marked as refinished (${returnRecord.quantity} pieces)`,
        userId: user.id
      });
      
      res.json({ message: "Return marked as refinished successfully", finishingRecordId: finishingRecord.id });
    } catch (error: any) {
      console.error("Error marking return as refinished:", error);
      res.status(500).json({ message: error.message || "Failed to mark return as refinished" });
    }
  });

  // Reject return for refinishing (Admin/QC only)
  app.post("/api/return-processing/reject", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Role-based access: only Admin and QC team can reject returns
      if (user?.role !== 'admin' && user?.role !== 'qc_team') {
        return res.status(403).json({ message: "Only Admin or QC team can reject returns" });
      }
      
      const { returnId, notes } = req.body;
      
      // Get the return record
      const returnRecord = await storage.getReturnRecord(returnId);
      if (!returnRecord) {
        return res.status(404).json({ message: "Return record not found" });
      }
      
      // Update return processing status
      await storage.updateReturnProcessingByReturnId(returnId, {
        status: "rejected",
        processedBy: userId,
        processedDate: new Date(),
        notes: notes || "Rejected - unsalvageable"
      });
      
      // Log activity  
      await storage.createActivityLog({
        skuId: returnRecord.skuId,
        module: 'returns',
        action: 'rejected',
        description: `Return ${returnRecord.orderId} rejected as unsalvageable (${returnRecord.quantity} pieces)`,
        userId: user.id
      });
      
      res.json({ message: "Return rejected successfully" });
    } catch (error: any) {
      console.error("Error rejecting return:", error);
      res.status(500).json({ message: error.message || "Failed to reject return" });
    }
  });

  app.post("/api/return-processing", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const validatedData = insertReturnProcessingSchema.parse({
        ...req.body,
        processedBy: userId,
        processedDate: new Date()
      });

      const returnProcessing = await storage.createReturnProcessing(validatedData);
      res.json(returnProcessing);
    } catch (error: any) {
      console.error("Error creating return processing:", error);
      res.status(500).json({ 
        message: error.message || "Failed to create return processing" 
      });
    }
  });

  app.put("/api/return-processing/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const validatedData = insertReturnProcessingSchema.partial().parse({
        ...req.body,
        processedBy: userId,
        processedDate: new Date()
      });

      const returnProcessing = await storage.updateReturnProcessing(id, validatedData);
      res.json(returnProcessing);
    } catch (error: any) {
      console.error("Error updating return processing:", error);
      res.status(500).json({ 
        message: error.message || "Failed to update return processing" 
      });
    }
  });

  // Refinishing workflow endpoints
  app.post("/api/return-processing/mark-refinished", isAuthenticated, async (req: any, res) => {
    try {
      const { returnId, notes } = req.body;
      const userId = req.user.claims.sub;
      const userRole = req.user.role;

      // Check if user has permission (Admin or QC team only)
      if (userRole !== 'admin' && userRole !== 'qc_team') {
        return res.status(403).json({ message: "Only Admin and QC team can mark returns as refinished" });
      }

      // Get the return record
      const returnRecord = await storage.getReturnRecord(returnId);
      if (!returnRecord) {
        return res.status(404).json({ message: "Return record not found" });
      }

      // Create finishing record with "Return" source
      const finishingRecord = await storage.createFinishingRecord({
        skuId: returnRecord.skuId,
        finishedPieces: returnRecord.quantity,
        rejectedPieces: 0,
        finishingDate: new Date().toISOString().split('T')[0],
        createdBy: userId,
        source: "Return",
        tag: "Refinished"
      });

      // Create or update return processing status
      await storage.updateReturnProcessingByReturnId(returnId, {
        status: 'refinished',
        processedBy: userId,
        processedDate: new Date(),
        notes: notes || "Marked as refinished via workflow",
        finishingRecordId: finishingRecord.id
      });

      res.json({ message: "Return marked as refinished successfully", finishingRecord });
    } catch (error: any) {
      console.error("Error marking return as refinished:", error);
      res.status(500).json({ 
        message: error.message || "Failed to mark return as refinished" 
      });
    }
  });

  app.post("/api/return-processing/reject", isAuthenticated, async (req: any, res) => {
    try {
      const { returnId, notes } = req.body;
      const userId = req.user.claims.sub;
      const userRole = req.user.role;

      // Check if user has permission (Admin or QC team only)
      if (userRole !== 'admin' && userRole !== 'qc_team') {
        return res.status(403).json({ message: "Only Admin and QC team can reject returns" });
      }

      // Update return processing status
      await storage.updateReturnProcessingByReturnId(returnId, {
        status: 'rejected',
        processedBy: userId,
        processedDate: new Date(),
        notes: notes || "Rejected as unsalvageable via workflow"
      });

      res.json({ message: "Return rejected successfully" });
    } catch (error: any) {
      console.error("Error rejecting return:", error);
      res.status(500).json({ 
        message: error.message || "Failed to reject return" 
      });
    }
  });

  // Return Analytics routes (Admin only)
  app.get("/api/return-analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Only admin can view return analytics
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admin can view return analytics" });
      }

      const returnAnalytics = await storage.getReturnAnalytics();
      res.json(returnAnalytics);
    } catch (error) {
      console.error("Error fetching return analytics:", error);
      res.status(500).json({ message: "Failed to fetch return analytics" });
    }
  });

  // Check Order ID route (for duplicate prevention)
  app.get("/api/check-order-id/:orderId", async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const exists = await storage.checkOrderIdExists(orderId);
      res.json({ exists });
    } catch (error) {
      console.error("Error checking order ID:", error);
      res.status(500).json({ message: "Failed to check order ID" });
    }
  });

  // Recommendation Engine API Routes
  
  // Track user interaction
  app.post("/api/user-interactions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertUserInteractionSchema.parse({
        ...req.body,
        userId,
        timestamp: new Date()
      });
      
      const interaction = await storage.trackUserInteraction(validatedData);
      res.json(interaction);
    } catch (error: any) {
      console.error("Error tracking user interaction:", error);
      res.status(500).json({ message: error.message || "Failed to track interaction" });
    }
  });

  // Get user recommendations
  app.get("/api/recommendations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const unreadOnly = req.query.unread === 'true';
      
      const recommendations = await storage.getUserRecommendations(userId, unreadOnly);
      res.json(recommendations);
    } catch (error: any) {
      console.error("Error fetching recommendations:", error);
      res.status(500).json({ message: error.message || "Failed to fetch recommendations" });
    }
  });

  // Generate new recommendations
  app.post("/api/recommendations/generate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.generateWorkflowRecommendations(userId);
      res.json({ message: "Recommendations generated successfully" });
    } catch (error: any) {
      console.error("Error generating recommendations:", error);
      res.status(500).json({ message: error.message || "Failed to generate recommendations" });
    }
  });

  // Mark recommendation as read
  app.patch("/api/recommendations/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.markRecommendationAsRead(id);
      res.json({ message: "Recommendation marked as read" });
    } catch (error: any) {
      console.error("Error marking recommendation as read:", error);
      res.status(500).json({ message: error.message || "Failed to mark recommendation as read" });
    }
  });

  // Toggle recommendation star
  app.patch("/api/recommendations/:id/star", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.toggleRecommendationStar(id);
      res.json({ message: "Recommendation star toggled" });
    } catch (error: any) {
      console.error("Error toggling recommendation star:", error);
      res.status(500).json({ message: error.message || "Failed to toggle star" });
    }
  });

  // Delete recommendation
  app.delete("/api/recommendations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteRecommendation(id);
      res.json({ message: "Recommendation deleted" });
    } catch (error: any) {
      console.error("Error deleting recommendation:", error);
      res.status(500).json({ message: error.message || "Failed to delete recommendation" });
    }
  });

  // Get user preferences
  app.get("/api/user-preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const preferences = await storage.getUserPreferences(userId);
      res.json(preferences);
    } catch (error: any) {
      console.error("Error fetching user preferences:", error);
      res.status(500).json({ message: error.message || "Failed to fetch preferences" });
    }
  });

  // Update user preferences
  app.put("/api/user-preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertUserPreferencesSchema.partial().parse(req.body);
      
      const preferences = await storage.updateUserPreferences(userId, validatedData);
      res.json(preferences);
    } catch (error: any) {
      console.error("Error updating user preferences:", error);
      res.status(500).json({ message: error.message || "Failed to update preferences" });
    }
  });

  // Get personalized insights
  app.get("/api/personalized-insights", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const insights = await storage.getPersonalizedInsights(userId);
      res.json(insights);
    } catch (error: any) {
      console.error("Error fetching personalized insights:", error);
      res.status(500).json({ message: error.message || "Failed to fetch insights" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
