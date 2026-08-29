-- Phase 8 du plan migrate-to-c12.md
-- Suppression de la table `feature_flags` (la config des features est
-- maintenant dans des fichiers YAML via c12, cf. src/config/c12-loader.js).
DROP TABLE IF EXISTS "feature_flags";
