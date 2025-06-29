# ClothingFlow - Hostinger Deployment Guide

## Overview
Complete step-by-step guide to deploy your ClothingFlow Manufacturing System on Hostinger web hosting.

## Prerequisites
- Hostinger hosting account with Node.js support
- PostgreSQL database access (available in Hostinger Premium/Business plans)
- SSH access to your hosting server
- Domain name configured

## Step 1: Database Setup

### 1.1 Create PostgreSQL Database
1. Login to your Hostinger control panel (hPanel)
2. Navigate to **Databases** → **PostgreSQL Databases**
3. Create a new database:
   - Database name: `clothingflow_db`
   - Username: Create a database user
   - Password: Generate a strong password
4. Note down the connection details:
   - Host: Usually `localhost` or provided by Hostinger
   - Port: Usually `5432`
   - Database name, username, and password

### 1.2 Import Database Schema
1. Access **phpPgAdmin** or use SSH to connect to PostgreSQL
2. Import the provided `database-schema.sql` file:
   ```bash
   psql -h localhost -U your_username -d clothingflow_db < database-schema.sql
   ```
3. Verify tables are created successfully

## Step 2: File Upload and Setup

### 2.1 Upload Files
1. Extract the production ZIP file
2. Upload all files to your domain's public_html folder via:
   - **File Manager** in hPanel, or
   - **FTP/SFTP** client (FileZilla recommended)
3. Ensure all files are in the root directory or subdirectory

### 2.2 Environment Configuration
1. Rename `.env.example` to `.env`
2. Update the `.env` file with your actual values:
   ```env
   DATABASE_URL=postgresql://username:password@localhost:5432/clothingflow_db
   SESSION_SECRET=your-generated-strong-session-secret-here
   NODE_ENV=production
   PORT=3000
   DOMAIN=yourdomain.com
   FRONTEND_URL=https://yourdomain.com
   BACKEND_URL=https://yourdomain.com
   ```

### 2.3 Generate Session Secret
Generate a strong session secret:
```bash
# Use any of these methods:
openssl rand -base64 32
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 3: Node.js Configuration

### 3.1 Enable Node.js
1. In hPanel, go to **Advanced** → **Node.js**
2. Create new Node.js app:
   - Node.js version: 18.x or higher
   - Application root: Your domain folder
   - Application URL: Your domain
   - Application startup file: `dist/server.js`

### 3.2 Install Dependencies
1. Access **Terminal** in hPanel or SSH
2. Navigate to your application directory
3. Install dependencies:
   ```bash
   npm install
   ```

## Step 4: Build Application

### 4.1 Build Frontend and Backend
```bash
# Build the application
npm run build

# This will create:
# - dist/public/ (frontend build)
# - dist/server.js (backend build)
```

### 4.2 Database Migration
```bash
# Run database migrations
npm run db:push
```

## Step 5: Start Application

### 5.1 Start Node.js App
1. In hPanel Node.js section, click **Start** application
2. Monitor logs for any errors
3. Access your domain to verify deployment

### 5.2 Test Application
1. Visit your domain: `https://yourdomain.com`
2. Test login functionality
3. Verify all manufacturing modules work correctly
4. Check database connectivity

## Step 6: SSL Configuration

### 6.1 Enable SSL
1. In hPanel, go to **Security** → **SSL/TLS**
2. Enable **Let's Encrypt SSL** for your domain
3. Force HTTPS redirects

## Step 7: Performance Optimization

### 7.1 Enable Compression
Add to your application startup:
```javascript
app.use(compression());
```

### 7.2 Static File Caching
Configure static file serving with appropriate cache headers.

## Troubleshooting

### Common Issues:

**1. Database Connection Error**
- Verify DATABASE_URL in .env file
- Check database credentials
- Ensure PostgreSQL service is running

**2. Application Won't Start**
- Check Node.js version compatibility
- Verify all dependencies are installed
- Review application logs in hPanel

**3. 502 Bad Gateway**
- Check if Node.js application is running
- Verify port configuration
- Review server logs

**4. Static Files Not Loading**
- Ensure build process completed successfully
- Check file permissions
- Verify Vite build configuration

**5. Authentication Issues**
- Verify SESSION_SECRET is set
- Check cookie settings for HTTPS
- Ensure database sessions table exists

## File Structure After Deployment
```
your-domain/
├── dist/
│   ├── public/          # Frontend build files
│   └── server.js        # Backend bundle
├── server/              # Server source files
├── client/              # Client source files
├── shared/              # Shared schemas
├── node_modules/        # Dependencies
├── package.json
├── .env                 # Environment variables
└── database-schema.sql  # Database schema
```

## Production Checklist

- [ ] Database created and schema imported
- [ ] Environment variables configured
- [ ] Dependencies installed successfully
- [ ] Application built successfully
- [ ] Node.js app started and running
- [ ] SSL certificate installed
- [ ] Domain resolves correctly
- [ ] All modules tested and working
- [ ] Authentication system functional
- [ ] Database operations working

## Support

For Hostinger-specific issues:
- Contact Hostinger support
- Check Hostinger knowledge base
- Review Node.js hosting documentation

For application issues:
- Review application logs
- Check database connectivity
- Verify environment configuration

## Security Notes

1. Keep .env file secure and never commit to version control
2. Use strong database passwords
3. Regularly update dependencies
4. Monitor application logs for suspicious activity
5. Enable firewall and security features in Hostinger

Your ClothingFlow Manufacturing System is now ready for production use on Hostinger!