import { factories } from '@strapi/strapi';

const UID = 'api::project.project' as const;

export default factories.createCoreController(UID);
