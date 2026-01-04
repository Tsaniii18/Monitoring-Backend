import express from 'express';
import { routerInfo, getInterfaces } from '../controllers/monitoring.controller.js';

const router = express.Router();

router.get('/router-info', routerInfo);
router.get('/interfaces', getInterfaces);

export default router;