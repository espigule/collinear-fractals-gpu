# Collinear Fractals — JavaScript / Node.js

Reference JavaScript implementation of the canonical-coordinate inverse search used by the web explorer.

## API

```js
const {
  getCanonicalCoordinates,
  inLens,
  computeEnclosure,
  firstAlphabetDigitAtOrAbove,
  inverseIterationTest
} = require('./index');

const c = { x: 0.5, y: 1.1 };
const result = inverseIterationTest(c.x, c.y, 3); // default kMax = 37
console.log(result.verdict); // Interior, Interior-offLens, Exterior, or Undetermined
```

`Interior` means a trap hit inside the parameter lens. `Interior-offLens` means the off-lens trap rule was used and is deliberately separated from the in-lens theorem-level label.

## Tests

```bash
npm test
```

See `../docs/QA_REPORT.md` for the publication QA record.
