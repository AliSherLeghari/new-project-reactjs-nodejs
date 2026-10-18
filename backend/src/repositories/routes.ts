import { Router } from 'express';
import { type RepositoryService } from './service.js';
import { validateRepository, validateSearch } from './validation.js';

export function createRepositoryRouter(service: RepositoryService) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/', async (req, res) => {
    res.json(await service.search(validateSearch(req.query)));
  });
  router.get('/:owner/:repo', async (req, res) => {
    const { owner, repo } = validateRepository(
      req.params.owner,
      req.params.repo,
    );
    res.json(await service.detail(owner, repo));
  });
  return router;
}
