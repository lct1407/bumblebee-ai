// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"billing.mdx": () => import("../content/docs/billing.mdx?collection=docs"), "cli.mdx": () => import("../content/docs/cli.mdx?collection=docs"), "devices.mdx": () => import("../content/docs/devices.mdx?collection=docs"), "getting-started.mdx": () => import("../content/docs/getting-started.mdx?collection=docs"), "index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "integrations.mdx": () => import("../content/docs/integrations.mdx?collection=docs"), "issues.mdx": () => import("../content/docs/issues.mdx?collection=docs"), "projects.mdx": () => import("../content/docs/projects.mdx?collection=docs"), }),
};
export default browserCollections;