# Evaluation Report

**Date**: 2026-03-22 09:52
**Tests**: 2/10 passed (20%)
**Avg latency**: 8ms

| # | Query | Type | Pass | Results | Latency | Notes |
|---|-------|------|------|---------|---------|-------|
| 1 | road construction projects in Chalakkudy | english | ✗ | 0 | 35ms | Should return road/tarring projects from |
| 2 | റോഡ് നിർമ്മാണം | malayalam | ✗ | 0 | 7ms | Pure Malayalam query for road constructi |
| 3 | What is the budget for project 273 in Ch | english | ✗ | 0 | 3ms | Specific project lookup — should return  |
| 4 | drinking water projects in Grama Panchay | english | ✗ | 0 | 3ms | Topic + LB type filter — should return w |
| 5 | CONCRETING ROAD IN JAIHIND SOCIETY | english | ✓ | 1 | 3ms | English project name exact match — shoul |
| 6 | compare spending between Adat and Athira | english | ✗ | 0 | 4ms | Cross-document comparison — agent should |
| 7 | ആശ്രയ പദ്ധതി | malayalam | ✓ | 7 | 6ms | Malayalam scheme name (Ashraya) — should |
| 8 | table of activities and expenses for war | english | ✗ | 0 | 9ms | Table lookup — should return table_rows  |
| 9 | how many projects does Thrissur Corporat | english | ✗ | 0 | 4ms | Aggregation query — agent should count/l |
| 10 | coconut farming development projects 202 | mixed | ✗ | 0 | 5ms | Mixed topic + year — should match നാളികേ |
