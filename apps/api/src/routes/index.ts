import { withCommon } from "../lib/middleware";
import { healthRoutes } from "./health";
import { articleRoutes } from "./articles";

export const routes = withCommon({
  ...healthRoutes,
  ...articleRoutes,
});
