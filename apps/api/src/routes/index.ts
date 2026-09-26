import { withCommon } from "../lib/middleware";
import { healthRoutes } from "./health";
import { postRoutes } from "./posts";
import { userRoutes } from "./users";

export const routes = withCommon({
  ...healthRoutes,
  ...userRoutes,
  ...postRoutes,
});
