import { Request, Response } from 'express';
import {
  getBusinesses,
  getBusinessById,
  getBusinessBySlug,
  getBusinessByWhatsAppPhone,
  createBusiness,
  updateBusiness,
  deleteBusiness,
  BusinessCreateRequest,
} from '../services/business.service';

export const listBusinesses = async (req: Request, res: Response): Promise<void> => {
  const businesses = await getBusinesses();
  res.json({
    success: true,
    data: businesses,
  });
};

export const getBusiness = async (req: Request, res: Response): Promise<void> => {
  const business = await getBusinessById(req.params.id!);
  res.json({
    success: true,
    data: business,
  });
};

export const getBusinessByPhone = async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.query;
  if (!phone || typeof phone !== 'string') {
    res.json({
      success: false,
      message: 'Phone parameter is required',
    });
    return;
  }

  const business = await getBusinessByWhatsAppPhone(phone);
  res.json({
    success: true,
    data: business,
  });
};

export const createNewBusiness = async (req: Request, res: Response): Promise<void> => {
  const data: BusinessCreateRequest = req.body;

  if (!data.name || !data.slug) {
    res.status(400).json({
      success: false,
      message: 'Name and slug are required',
    });
    return;
  }

  const business = await createBusiness(data);
  res.status(201).json({
    success: true,
    data: business,
  });
};

export const updateExistingBusiness = async (req: Request, res: Response): Promise<void> => {
  const business = await updateBusiness(req.params.id!, req.body);
  res.json({
    success: true,
    data: business,
  });
};

export const deleteExistingBusiness = async (req: Request, res: Response): Promise<void> => {
  await deleteBusiness(req.params.id!);
  res.json({
    success: true,
    message: 'Business deleted successfully',
  });
};
