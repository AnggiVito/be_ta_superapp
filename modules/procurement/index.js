
import express from 'express';
import submissionRoutes from './routes.js';
import * as inventoryController from './controllers/inventoryController.js';
import * as inventoryCategoryController from './controllers/inventoryCategoryController.js';
import { validateJWT } from '../../core/auth/jwt-validator.js';

const router = express.Router();

// Mount submission routes under /submission
router.use('/submission', submissionRoutes);

// Mount inventory routes at /inventory (module-level)
router.post('/inventory', validateJWT, inventoryController.createInventory);
router.get('/inventory', validateJWT, inventoryController.listInventory);
router.get('/inventory/logs', validateJWT, inventoryController.listAllInventoryLogs);
// Inventory categories (TPA can manage categories)
// Keep these static routes before /inventory/:id to avoid "categories" being parsed as id.
router.get('/inventory/categories', validateJWT, inventoryCategoryController.listCategories);
router.post('/inventory/categories', validateJWT, inventoryCategoryController.createCategory);
router.delete('/inventory/categories/:id', validateJWT, inventoryCategoryController.deleteCategory);
// Quarterly report endpoint (per-item)
router.post('/inventory/reports/quarterly', validateJWT, inventoryController.quarterlyReportCtrl);
router.get('/inventory/low-stock', validateJWT, inventoryController.listLowStockInventory);
router.get('/inventory/:id', validateJWT, inventoryController.getInventory);
router.get('/inventory/:id/logs', validateJWT, inventoryController.listInventoryLogs);
router.put('/inventory/:id', validateJWT, inventoryController.updateInventoryCtrl);
router.delete('/inventory/:id', validateJWT, inventoryController.deleteInventoryCtrl);

// Module health
router.get('/health', (_req, res) => res.json({ ok: true, module: 'procurement' }));

export default router;
