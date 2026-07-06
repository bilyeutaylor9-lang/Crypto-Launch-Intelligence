#!/usr/bin/env node
import { program } from "commander";
import { ingest } from "./ingest.js";
import { trainOnline } from "./ml/trainOnline.js";

program
  .command("ingest")
  .description("Fetch live pool data and add snapshots to SQLite")
  .action(async () => {
    await ingest(1);
  });

program
  .command("train")
  .description("Retrain the logistic-regression model")
  .action(async () => {
    await trainOnline();
  });

program.parseAsync();
