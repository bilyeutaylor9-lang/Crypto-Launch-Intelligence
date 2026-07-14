// src/data/dataSourceRegistry.js

import {
  getSourceManifest,
  groupSourcesByCategory,
  summarizeSourceManifest,
} from "../config/sourceManifest.js";

export const DATA_SOURCES = groupSourcesByCategory();

export function getAllDataSources() {
  return getSourceManifest().map((source) => source.id);
}

export function getDataSourceCount() {
  return getAllDataSources().length;
}

export function printDataSourceSummary() {
  return summarizeSourceManifest();
}
