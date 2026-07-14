import { Router } from 'express';
import { checkAvailability, makeReservation, warmSession } from '../services/opentableService.js';

export const reservationRoutes = Router();

reservationRoutes.post('/sessions/warm', async (req, res, next) => {
  try {
    const result = await warmSession();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

reservationRoutes.post('/availability', async (req, res, next) => {
  try {
    const result = await checkAvailability(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

reservationRoutes.post('/reservations', async (req, res, next) => {
  try {
    const result = await makeReservation(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
