// @ts-nocheck
import * as __fd_glob_8 from "../content/docs/projects.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/issues.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/integrations.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/index.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/getting-started.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/devices.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/cli.mdx?collection=docs"
import * as __fd_glob_1 from "../content/docs/billing.mdx?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, }, {"billing.mdx": __fd_glob_1, "cli.mdx": __fd_glob_2, "devices.mdx": __fd_glob_3, "getting-started.mdx": __fd_glob_4, "index.mdx": __fd_glob_5, "integrations.mdx": __fd_glob_6, "issues.mdx": __fd_glob_7, "projects.mdx": __fd_glob_8, });