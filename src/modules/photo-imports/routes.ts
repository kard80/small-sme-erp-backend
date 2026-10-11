import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { HttpError } from '../../shared/errors';
import { parseObjectIdParam } from '../../shared/http';
import { listQuerySchema, maxImageBytes } from './schemas';
import { photoImportsService } from './service';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxImageBytes, files: 1 } });

const receiveImage = (req: Request, res: Response, next: NextFunction) => {
  upload.single('image')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return next(new HttpError(err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์ใหญ่เกิน 10 MB' : 'คำขอไม่ถูกต้อง', err.code === 'LIMIT_FILE_SIZE' ? 413 : 400));
    }
    return next(err);
  });
};

export const createPhotoImportsRouter = () => {
  const router = Router();
  // requireAuth is mounted in app/rest.ts, so authUser is always set here.
  const userId = (req: Request) => req.authUser!.id;

  router.post('/', receiveImage, async (req, res) => {
    return res.status(201).json(await photoImportsService.upload(userId(req), req.file));
  });

  router.get('/', async (req, res) => {
    const query = listQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({ error: 'คำขอไม่ถูกต้อง' });
    }
    return res.json(await photoImportsService.list(userId(req), query.data.status));
  });

  router.get('/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'รายการนำเข้า');
    if (id === undefined) {
      return;
    }
    return res.json(await photoImportsService.get(userId(req), id));
  });

  router.post('/:id/retry', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'รายการนำเข้า');
    if (id === undefined) {
      return;
    }
    return res.json(await photoImportsService.retry(userId(req), id));
  });

  router.post('/:id/consume', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'รายการนำเข้า');
    if (id === undefined) {
      return;
    }
    return res.json(await photoImportsService.consume(userId(req), id));
  });

  router.delete('/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'รายการนำเข้า');
    if (id === undefined) {
      return;
    }
    await photoImportsService.remove(userId(req), id);
    return res.status(204).send();
  });

  return router;
};
