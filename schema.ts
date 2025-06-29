import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  integer,
  decimal,
  date,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("admin"), // admin, fabric_staff, cutting_master, line_master, finishing_head, warehouse_head, sales_team
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// SKU master table
export const skus = pgTable("skus", {
  id: serial("id").primaryKey(),
  sku: varchar("sku").unique().notNull(),
  productName: varchar("product_name").notNull(),
  fabricType: varchar("fabric_type"),
  category: varchar("category"),
  size: varchar("size"),
  color: varchar("color"),
  price: decimal("price", { precision: 10, scale: 2 }),
  barcode: varchar("barcode").unique(),
  imageUrl: varchar("image_url"),
  avgConsumption: decimal("avg_consumption", { precision: 8, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Fabric stock table (real-time fabric inventory)
export const fabricStock = pgTable("fabric_stock", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").references(() => skus.id).notNull(),
  fabricType: varchar("fabric_type").notNull(),
  fabricWidth: decimal("fabric_width", { precision: 8, scale: 2 }).notNull(),
  totalMeters: decimal("total_meters", { precision: 10, scale: 2 }).notNull(),
  availableMeters: decimal("available_meters", { precision: 10, scale: 2 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Fabric metering records (transaction log)
export const fabricRecords = pgTable("fabric_records", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").references(() => skus.id).notNull(),
  fabricType: varchar("fabric_type").notNull(),
  fabricName: varchar("fabric_name").notNull(),
  fabricWidth: decimal("fabric_width", { precision: 8, scale: 2 }).notNull(),
  totalMeters: decimal("total_meters", { precision: 10, scale: 2 }).notNull(),
  metersReceived: decimal("meters_received", { precision: 10, scale: 2 }).notNull(),
  date: date("date").notNull(),
  remarks: text("remarks"),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Cutting records with wastage calculation
export const cuttingRecords = pgTable("cutting_records", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").references(() => skus.id).notNull(),
  totalFabricUsed: decimal("total_fabric_used", { precision: 10, scale: 2 }).notNull(),
  avgFabricPerPiece: decimal("avg_fabric_per_piece", { precision: 8, scale: 4 }).notNull(),
  wastagePercentage: decimal("wastage_percentage", { precision: 5, scale: 2 }).notNull(),
  actualFabricPerPiece: decimal("actual_fabric_per_piece", { precision: 8, scale: 4 }).notNull(),
  totalPiecesCut: integer("total_pieces_cut").notNull(),
  rejectedFabric: decimal("rejected_fabric", { precision: 10, scale: 2 }).notNull(),
  cuttingDate: date("cutting_date").notNull(),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Production records (simplified - no line number)
export const productionRecords = pgTable("production_records", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").references(() => skus.id).notNull(),
  totalStitched: integer("total_stitched").notNull(),
  rejectedPieces: integer("rejected_pieces").notNull(),
  productionDate: date("production_date").notNull(),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Finishing records
export const finishingRecords = pgTable("finishing_records", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").references(() => skus.id).notNull(),
  finishedPieces: integer("finished_pieces").notNull(),
  rejectedPieces: integer("rejected_pieces").notNull(),
  finishingDate: date("finishing_date").notNull(),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Warehouse stock (real-time warehouse inventory)
export const warehouseStock = pgTable("warehouse_stock", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").references(() => skus.id).notNull(),
  availableQuantity: integer("available_quantity").notNull(),
  storageLocation: varchar("storage_location"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Warehouse inbound records (transaction log)
export const warehouseRecords = pgTable("warehouse_records", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").references(() => skus.id).notNull(),
  quantityReceived: integer("quantity_received").notNull(),
  storageLocation: varchar("storage_location"),
  receivedDate: date("received_date").notNull(),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  returnId: integer("return_id").references(() => returnRecords.id), // Track if this entry came from a saleable return
});

// Sales records
export const salesRecords = pgTable("sales_records", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").references(() => skus.id).notNull(),
  quantitySold: integer("quantity_sold").notNull(),
  platformName: varchar("platform_name").notNull(), // amazon, flipkart, meesho, myntra, snapdeal, ajio, nykaa, website, offline
  orderId: varchar("order_id"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }),
  saleDate: date("sale_date").notNull(),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Excel import log
export const excelImports = pgTable("excel_imports", {
  id: serial("id").primaryKey(),
  fileName: varchar("file_name").notNull(),
  totalRecords: integer("total_records").notNull(),
  successfulRecords: integer("successful_records").notNull(),
  failedRecords: integer("failed_records").notNull(),
  importDate: timestamp("import_date").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
});

// Activity log for traceability and recent activity tracking
export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").references(() => skus.id),
  module: varchar("module").notNull(), // fabric, cutting, production, finishing, warehouse, sales
  action: varchar("action").notNull(), // added, updated, deleted, imported
  description: text("description").notNull(),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  userId: varchar("user_id").references(() => users.id).notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

// SKU status tracking for workflow validation and dependency logic
export const skuStatus = pgTable("sku_status", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").references(() => skus.id).notNull().unique(),
  hasFabric: boolean("has_fabric").notNull().default(false),
  hasCutting: boolean("has_cutting").notNull().default(false),
  hasProduction: boolean("has_production").notNull().default(false),
  hasFinishing: boolean("has_finishing").notNull().default(false),
  hasWarehouse: boolean("has_warehouse").notNull().default(false),
  hasSales: boolean("has_sales").notNull().default(false),
  fabricQuantity: decimal("fabric_quantity", { precision: 10, scale: 2 }).default('0'),
  cuttingQuantity: integer("cutting_quantity").default(0),
  productionQuantity: integer("production_quantity").default(0),
  finishingQuantity: integer("finishing_quantity").default(0),
  warehouseQuantity: integer("warehouse_quantity").default(0),
  salesQuantity: integer("sales_quantity").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User interaction tracking for recommendation engine
export const userInteractions = pgTable("user_interactions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  module: varchar("module").notNull(), // fabric, cutting, production, finishing, warehouse, sales, dashboard, returns
  action: varchar("action").notNull(), // view, create, update, delete, export, filter, search
  duration: integer("duration"), // time spent in seconds
  context: jsonb("context"), // additional context data like SKU, filters applied, etc.
  timestamp: timestamp("timestamp").defaultNow(),
});

// Workflow recommendations generated by the AI engine
export const workflowRecommendations = pgTable("workflow_recommendations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  recommendationType: varchar("recommendation_type").notNull(), // workflow_optimization, bottleneck_alert, efficiency_tip, quirky_insight
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  actionUrl: varchar("action_url"), // URL to navigate to
  priority: varchar("priority").notNull().default("medium"), // high, medium, low
  category: varchar("category").notNull(), // productivity, quality, efficiency, insights, bottlenecks
  isRead: boolean("is_read").notNull().default(false),
  isStarred: boolean("is_starred").notNull().default(false),
  quirkyFactor: integer("quirky_factor").default(0), // 0-10 scale for how quirky/fun the insight is
  generatedAt: timestamp("generated_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

// User preferences for personalized recommendations
export const userPreferences = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  preferredModules: jsonb("preferred_modules"), // array of module names user interacts with most
  workingHours: jsonb("working_hours"), // user's typical working hours for timing recommendations
  quirkiness: integer("quirkiness").default(5), // 1-10 scale for how quirky they want insights
  notificationFrequency: varchar("notification_frequency").default("daily"), // daily, weekly, immediate
  focusAreas: jsonb("focus_areas"), // areas they want to focus on: quality, efficiency, productivity
  recommendationsEnabled: boolean("recommendations_enabled").default(true),
  dailyDigest: boolean("daily_digest").default(false),
  efficiencyAlerts: boolean("efficiency_alerts").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const skusRelations = relations(skus, ({ many, one }) => ({
  fabricRecords: many(fabricRecords),
  fabricStock: one(fabricStock),
  cuttingRecords: many(cuttingRecords),
  productionRecords: many(productionRecords),
  finishingRecords: many(finishingRecords),
  warehouseRecords: many(warehouseRecords),
  warehouseStock: one(warehouseStock),
  salesRecords: many(salesRecords),
  activityLogs: many(activityLog),
}));

export const fabricStockRelations = relations(fabricStock, ({ one }) => ({
  sku: one(skus, { fields: [fabricStock.skuId], references: [skus.id] }),
}));

export const fabricRecordsRelations = relations(fabricRecords, ({ one }) => ({
  sku: one(skus, { fields: [fabricRecords.skuId], references: [skus.id] }),
  createdByUser: one(users, { fields: [fabricRecords.createdBy], references: [users.id] }),
}));

export const cuttingRecordsRelations = relations(cuttingRecords, ({ one }) => ({
  sku: one(skus, { fields: [cuttingRecords.skuId], references: [skus.id] }),
  createdByUser: one(users, { fields: [cuttingRecords.createdBy], references: [users.id] }),
}));

export const productionRecordsRelations = relations(productionRecords, ({ one }) => ({
  sku: one(skus, { fields: [productionRecords.skuId], references: [skus.id] }),
  createdByUser: one(users, { fields: [productionRecords.createdBy], references: [users.id] }),
}));

export const finishingRecordsRelations = relations(finishingRecords, ({ one }) => ({
  sku: one(skus, { fields: [finishingRecords.skuId], references: [skus.id] }),
  createdByUser: one(users, { fields: [finishingRecords.createdBy], references: [users.id] }),
}));

export const warehouseStockRelations = relations(warehouseStock, ({ one }) => ({
  sku: one(skus, { fields: [warehouseStock.skuId], references: [skus.id] }),
}));

export const warehouseRecordsRelations = relations(warehouseRecords, ({ one }) => ({
  sku: one(skus, { fields: [warehouseRecords.skuId], references: [skus.id] }),
  createdByUser: one(users, { fields: [warehouseRecords.createdBy], references: [users.id] }),
}));

export const salesRecordsRelations = relations(salesRecords, ({ one }) => ({
  sku: one(skus, { fields: [salesRecords.skuId], references: [skus.id] }),
  createdByUser: one(users, { fields: [salesRecords.createdBy], references: [users.id] }),
}));

export const excelImportsRelations = relations(excelImports, ({ one }) => ({
  createdByUser: one(users, { fields: [excelImports.createdBy], references: [users.id] }),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  sku: one(skus, { fields: [activityLog.skuId], references: [skus.id] }),
  user: one(users, { fields: [activityLog.userId], references: [users.id] }),
}));

// Return Management tables
export const returnRecords = pgTable("return_records", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").references(() => skus.id).notNull(),
  orderId: varchar("order_id").unique().notNull(), // Unique constraint to prevent duplicates
  quantity: integer("quantity").notNull(),
  returnType: varchar("return_type").notNull(), // "offline" | "e-commerce"
  eCommerceSubtype: varchar("e_commerce_subtype"), // "courier_return" | "customer_return" (only for e-commerce)
  returnCondition: varchar("return_condition").notNull(), // "saleable" | "refinishing_required" | "rejected"
  returnSourcePanel: varchar("return_source_panel").notNull(), // Amazon, Flipkart, Myntra, etc.
  returnReason: text("return_reason"), // Optional
  returnDate: date("return_date").notNull(),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Return processing records (for tracking refinishing status)
export const returnProcessing = pgTable("return_processing", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").references(() => returnRecords.id).notNull(),
  status: varchar("status").notNull().default("pending"), // "pending" | "refinished" | "rejected"
  processedBy: varchar("processed_by").references(() => users.id),
  processedDate: timestamp("processed_date"),
  notes: text("notes"),
  finishingRecordId: integer("finishing_record_id").references(() => finishingRecords.id), // Links to created finishing record
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const returnRecordsRelations = relations(returnRecords, ({ one, many }) => ({
  sku: one(skus, { fields: [returnRecords.skuId], references: [skus.id] }),
  createdByUser: one(users, { fields: [returnRecords.createdBy], references: [users.id] }),
  processing: many(returnProcessing),
}));

export const returnProcessingRelations = relations(returnProcessing, ({ one }) => ({
  returnRecord: one(returnRecords, { fields: [returnProcessing.returnId], references: [returnRecords.id] }),
  processedByUser: one(users, { fields: [returnProcessing.processedBy], references: [users.id] }),
}));

// Insert schemas
export const insertSkuSchema = createInsertSchema(skus).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  avgConsumption: z.union([z.string(), z.number()]).optional().transform((val) => {
    if (val === null || val === undefined || val === '') return undefined;
    return typeof val === 'string' ? parseFloat(val) : val;
  }),
});

export const insertFabricRecordSchema = createInsertSchema(fabricRecords).omit({
  id: true,
  createdAt: true,
}).extend({
  skuId: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  metersReceived: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  fabricWidth: z.union([z.string(), z.number()]).optional().transform((val) => val ? Number(val) : undefined),
});

export const insertCuttingRecordSchema = createInsertSchema(cuttingRecords).omit({
  id: true,
  createdAt: true,
}).extend({
  skuId: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  totalFabricUsed: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  avgFabricPerPiece: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  wastagePercentage: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  actualFabricPerPiece: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  totalPiecesCut: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  rejectedFabric: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  cuttingDate: z.union([z.string(), z.date()]).transform((val) => {
    if (typeof val === 'string') return val;
    return val.toISOString().split('T')[0];
  }),
});

export const insertProductionRecordSchema = z.object({
  skuId: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  totalStitched: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  rejectedPieces: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  productionDate: z.union([z.string(), z.date()]).transform((val) => {
    if (typeof val === 'string') return val;
    return val.toISOString().split('T')[0];
  }),
  createdBy: z.string(),
});

export const insertFinishingRecordSchema = z.object({
  skuId: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  finishedPieces: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  rejectedPieces: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  finishingDate: z.union([z.string(), z.date()]).transform((val) => {
    if (typeof val === 'string') return val;
    return val.toISOString().split('T')[0];
  }),
  createdBy: z.string(),
});

export const insertWarehouseRecordSchema = z.object({
  skuId: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  quantityReceived: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  storageLocation: z.string().nullable().optional(),
  receivedDate: z.union([z.string(), z.date()]).transform((val) => {
    if (typeof val === 'string') return val;
    return val.toISOString().split('T')[0];
  }),
  createdBy: z.string(),
  returnId: z.union([z.string(), z.number()]).optional().transform((val) => val ? Number(val) : undefined),
});

export const insertSalesRecordSchema = createInsertSchema(salesRecords).omit({
  id: true,
  createdAt: true,
}).extend({
  skuId: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  quantitySold: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  platformName: z.string(),
  orderId: z.string().nullable().optional(),
  unitPrice: z.union([z.string(), z.number()]).nullable().optional().transform((val) => val ? String(val) : null),
  totalAmount: z.union([z.string(), z.number()]).nullable().optional().transform((val) => val ? String(val) : null),
  saleDate: z.union([z.string(), z.date()]).transform((val) => {
    if (typeof val === 'string') return val;
    return val.toISOString().split('T')[0];
  }),
  createdBy: z.string(),
});

export const insertExcelImportSchema = createInsertSchema(excelImports).omit({
  id: true,
  importDate: true,
});

export const insertActivityLogSchema = createInsertSchema(activityLog).omit({
  id: true,
  timestamp: true,
});

export const insertSkuStatusSchema = createInsertSchema(skuStatus).omit({
  id: true,
  updatedAt: true,
});

export const updateSkuStatusSchema = createInsertSchema(skuStatus).omit({
  id: true,
  skuId: true,
  updatedAt: true,
}).partial();

// Return Management schemas
export const insertReturnRecordSchema = createInsertSchema(returnRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  skuId: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  quantity: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  returnDate: z.union([z.string(), z.date()]).transform((val) => {
    if (typeof val === 'string') return val;
    return val.toISOString().split('T')[0];
  }),
});

export const insertReturnProcessingSchema = createInsertSchema(returnProcessing).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  returnId: z.union([z.string(), z.number()]).transform((val) => Number(val)),
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export type Sku = typeof skus.$inferSelect;
export type InsertSku = z.infer<typeof insertSkuSchema>;

export type FabricStock = typeof fabricStock.$inferSelect;
export type FabricRecord = typeof fabricRecords.$inferSelect;
export type InsertFabricRecord = z.infer<typeof insertFabricRecordSchema>;

export type CuttingRecord = typeof cuttingRecords.$inferSelect;
export type InsertCuttingRecord = z.infer<typeof insertCuttingRecordSchema>;

export type ProductionRecord = typeof productionRecords.$inferSelect;
export type InsertProductionRecord = z.infer<typeof insertProductionRecordSchema>;

export type FinishingRecord = typeof finishingRecords.$inferSelect;
export type InsertFinishingRecord = z.infer<typeof insertFinishingRecordSchema>;

export type WarehouseStock = typeof warehouseStock.$inferSelect;
export type WarehouseRecord = typeof warehouseRecords.$inferSelect;
export type InsertWarehouseRecord = z.infer<typeof insertWarehouseRecordSchema>;

export type SalesRecord = typeof salesRecords.$inferSelect;
export type InsertSalesRecord = z.infer<typeof insertSalesRecordSchema>;

export type ExcelImport = typeof excelImports.$inferSelect;
export type InsertExcelImport = z.infer<typeof insertExcelImportSchema>;

export type ActivityLog = typeof activityLog.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export type ReturnRecord = typeof returnRecords.$inferSelect;
export type InsertReturnRecord = z.infer<typeof insertReturnRecordSchema>;

export type ReturnProcessing = typeof returnProcessing.$inferSelect;
export type InsertReturnProcessing = z.infer<typeof insertReturnProcessingSchema>;

// Recommendation Engine schemas
export const insertUserInteractionSchema = createInsertSchema(userInteractions).omit({
  id: true,
  timestamp: true,
});

export const insertWorkflowRecommendationSchema = createInsertSchema(workflowRecommendations).omit({
  id: true,
  generatedAt: true,
}).extend({
  quirkyFactor: z.union([z.string(), z.number()]).optional().transform((val) => val ? Number(val) : 0),
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({
  id: true,
  updatedAt: true,
}).extend({
  quirkiness: z.union([z.string(), z.number()]).optional().transform((val) => val ? Number(val) : 5),
});

// Recommendation Engine types
export type UserInteraction = typeof userInteractions.$inferSelect;
export type InsertUserInteraction = z.infer<typeof insertUserInteractionSchema>;

export type WorkflowRecommendation = typeof workflowRecommendations.$inferSelect;
export type InsertWorkflowRecommendation = z.infer<typeof insertWorkflowRecommendationSchema>;

export type UserPreferences = typeof userPreferences.$inferSelect;
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;

// WIP Tracker type for real-time pipeline view
export type WipTracker = {
  skuId: number;
  sku: string;
  productName: string;
  barcode?: string;
  fabricInStock: number;
  fabricUsed: number;
  piecesCut: number;
  piecesStitched: number;
  piecesFinished: number;
  warehouseStock: number;
  piecesSold: number;
  currentStage: 'fabric' | 'cutting' | 'production' | 'finishing' | 'warehouse' | 'completed';
  lastActivity: Date;
  actualInProcess?: {
    fabricAvailable: number;
    cuttingInProgress: number;
    productionInProgress: number;
    finishingInProgress: number;
    warehouseStock: number;
  };
};

// Inventory summary type
export type InventorySummary = {
  skuId: number;
  sku: string;
  productName: string;
  barcode: string | null;
  fabricMeters: number;
  piecesCut: number;
  piecesStitched: number;
  piecesFinished: number;
  warehouseStock: number;
  piecesSold: number;
  saleableReturns: number;
  availableStock: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
};

// Bulk SKU upload validation schema
export const bulkSkuUploadSchema = z.object({
  skuName: z.string().min(1, "SKU Name is required").max(255, "SKU Name too long"),
  skuCode: z.string().min(1, "SKU Code is required").max(50, "SKU Code too long"),
  category: z.string().optional(),
  fabricType: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  quantity: z.string().optional().transform((val) => val ? parseInt(val, 10) : undefined),
  price: z.string().optional().transform((val) => val ? parseFloat(val) : undefined),
  avgConsumption: z.string().optional().transform((val) => val ? parseFloat(val) : undefined),
});

export type BulkSkuUpload = z.infer<typeof bulkSkuUploadSchema>;

// Bulk upload result type
export type BulkUploadResult = {
  success: boolean;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: Array<{
    row: number;
    errors: string[];
    data: any;
  }>;
  duplicateSkus: string[];
};
