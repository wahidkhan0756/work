-- ClothingFlow Manufacturing System Database Schema
-- Complete SQL schema for PostgreSQL database setup

-- Create Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    profile_image_url TEXT,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Sessions table
CREATE TABLE IF NOT EXISTS session (
    sid VARCHAR NOT NULL COLLATE "default",
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
) WITH (OIDS=FALSE);

ALTER TABLE session ADD CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX IDX_session_expire ON session (expire);

-- Create SKUs table
CREATE TABLE IF NOT EXISTS skus (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(100) UNIQUE NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    fabric_type VARCHAR(100),
    category VARCHAR(100),
    color VARCHAR(50),
    size VARCHAR(20),
    price DECIMAL(10,2),
    barcode VARCHAR(100),
    image_url TEXT,
    avg_consumption DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Fabric Records table
CREATE TABLE IF NOT EXISTS fabric_records (
    id SERIAL PRIMARY KEY,
    sku_id INTEGER REFERENCES skus(id),
    fabric_type VARCHAR(100) NOT NULL,
    fabric_name VARCHAR(255) NOT NULL,
    fabric_width VARCHAR(20),
    total_meters DECIMAL(10,2) NOT NULL,
    meters_received DECIMAL(10,2) NOT NULL,
    date DATE NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Fabric Stock table
CREATE TABLE IF NOT EXISTS fabric_stock (
    id SERIAL PRIMARY KEY,
    sku_id INTEGER REFERENCES skus(id),
    fabric_type VARCHAR(100) NOT NULL,
    available_meters DECIMAL(10,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Cutting Records table
CREATE TABLE IF NOT EXISTS cutting_records (
    id SERIAL PRIMARY KEY,
    sku_id INTEGER REFERENCES skus(id),
    total_fabric_used DECIMAL(10,2) NOT NULL,
    avg_fabric_per_piece DECIMAL(10,2) NOT NULL,
    wastage_percentage DECIMAL(5,2) NOT NULL,
    actual_fabric_per_piece DECIMAL(10,2) NOT NULL,
    total_pieces_cut INTEGER NOT NULL,
    rejected_fabric DECIMAL(10,2) DEFAULT 0,
    cutting_date DATE NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Production Records table
CREATE TABLE IF NOT EXISTS production_records (
    id SERIAL PRIMARY KEY,
    sku_id INTEGER REFERENCES skus(id),
    total_stitched INTEGER NOT NULL,
    rejected_pieces INTEGER DEFAULT 0,
    production_date DATE NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    batch_number VARCHAR(100),
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Finishing Records table
CREATE TABLE IF NOT EXISTS finishing_records (
    id SERIAL PRIMARY KEY,
    sku_id INTEGER REFERENCES skus(id),
    finished_pieces INTEGER NOT NULL,
    rejected_pieces INTEGER DEFAULT 0,
    finishing_date DATE NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    tag VARCHAR(100),
    source VARCHAR(100) DEFAULT 'production',
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Warehouse Records table
CREATE TABLE IF NOT EXISTS warehouse_records (
    id SERIAL PRIMARY KEY,
    sku_id INTEGER REFERENCES skus(id),
    quantity_received INTEGER NOT NULL,
    storage_location VARCHAR(100),
    received_date DATE NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    return_id INTEGER,
    return_source_panel VARCHAR(100),
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Warehouse Stock table
CREATE TABLE IF NOT EXISTS warehouse_stock (
    id SERIAL PRIMARY KEY,
    sku_id INTEGER REFERENCES skus(id),
    available_quantity INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Sales Records table
CREATE TABLE IF NOT EXISTS sales_records (
    id SERIAL PRIMARY KEY,
    sku_id INTEGER REFERENCES skus(id),
    quantity_sold INTEGER NOT NULL,
    platform_name VARCHAR(100) NOT NULL,
    order_id VARCHAR(100),
    unit_price DECIMAL(10,2),
    total_amount DECIMAL(10,2),
    sale_date DATE NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Return Records table
CREATE TABLE IF NOT EXISTS return_records (
    id SERIAL PRIMARY KEY,
    sku_id INTEGER REFERENCES skus(id),
    order_id VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL,
    return_type VARCHAR(50) NOT NULL,
    e_commerce_subtype VARCHAR(100),
    return_condition VARCHAR(50) NOT NULL,
    return_source_panel VARCHAR(100) NOT NULL,
    return_reason TEXT,
    return_date DATE NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Return Processing table
CREATE TABLE IF NOT EXISTS return_processing (
    id SERIAL PRIMARY KEY,
    return_id INTEGER REFERENCES return_records(id),
    processing_status VARCHAR(50) DEFAULT 'pending',
    finishing_record_id INTEGER REFERENCES finishing_records(id),
    processed_date DATE,
    processed_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Activity Logs table
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    sku_id INTEGER REFERENCES skus(id),
    module VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample admin user
INSERT INTO users (id, email, first_name, last_name, role) 
VALUES ('admin-001', 'admin@clothingflow.com', 'System', 'Administrator', 'admin')
ON CONFLICT (id) DO NOTHING;

-- Insert sample SKU
INSERT INTO skus (sku, product_name, fabric_type, category, color, size, price, avg_consumption)
VALUES ('AK010', 'Straight Kurta', 'Rayon', 'Women Kurta', 'Black', 'M', 599.00, 2.5)
ON CONFLICT (sku) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_fabric_records_sku_id ON fabric_records(sku_id);
CREATE INDEX IF NOT EXISTS idx_cutting_records_sku_id ON cutting_records(sku_id);
CREATE INDEX IF NOT EXISTS idx_production_records_sku_id ON production_records(sku_id);
CREATE INDEX IF NOT EXISTS idx_finishing_records_sku_id ON finishing_records(sku_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_records_sku_id ON warehouse_records(sku_id);
CREATE INDEX IF NOT EXISTS idx_sales_records_sku_id ON sales_records(sku_id);
CREATE INDEX IF NOT EXISTS idx_return_records_sku_id ON return_records(sku_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_sku_id ON activity_logs(sku_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);