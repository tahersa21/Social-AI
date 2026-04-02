import express, { type Express } from "express";
import cors from "cors";
import router from "./routes/index.js";
import { authMiddleware } from "./middleware/authMiddleware.js";

const app: Express = express();

app.use(cors());
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

app.use(authMiddleware);
app.use("/api", router);

export default app;
