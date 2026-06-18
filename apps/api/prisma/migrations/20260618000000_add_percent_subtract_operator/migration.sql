-- Add a "subtract percent" operator to campaign formulas so a step can reduce
-- the base price by a percentage (e.g. "ลด 5%"), which previously required an
-- unintuitive MULTIPLY by 0.95. Adding an enum value is non-destructive and
-- leaves all existing formulas (ADD/SUBTRACT/MULTIPLY/PERCENT) unchanged.
ALTER TYPE "FormulaOperator" ADD VALUE IF NOT EXISTS 'PERCENT_SUBTRACT';
