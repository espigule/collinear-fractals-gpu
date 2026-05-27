export function getEffectiveC(x, y) {
  const rho2 = x * x + y * y;
  if (rho2 < 1.0 && rho2 > 0.0) {
    return { x: x / rho2, y: -y / rho2 };
  }
  return { x, y };
}

export function inLens(x, y, n) {
  const eff = getEffectiveC(x, y);
  x = eff.x;
  y = eff.y;
  const rho = Math.hypot(x, y);
  const N = 2 * n - 1;
  return rho > 1.0 && y !== 0.0 && (rho * rho + 2 * Math.abs(x) < N);
}

export function chooseTailDepth(rho, tol, minM = 30, maxM = 2000) {
  const target = -Math.log(tol * (rho - 1.0)) / Math.log(rho);
  let M = Math.max(minM, Math.ceil(target));
  const capped = M > maxM;
  if (capped) M = maxM;
  return { M, capped };
}

export function firstAlphabetDigitAtOrAbove(a, m) {
  const parity = ((m - 1) % 2 + 2) % 2;
  let t = Math.ceil(a);
  if (((t - parity) % 2 + 2) % 2 !== 0) t += 1;
  return t;
}

export function interiorVerdict(isLens) {
  return isLens ? 'Interior' : 'Interior-offLens';
}

export function computeEnclosureGeneral(x, y, m, tol = 1e-8) {
  const eff = getEffectiveC(x, y);
  x = eff.x;
  y = eff.y;
  const rho = Math.hypot(x, y);
  if (rho <= 1.0 || y === 0.0) {
    return { se: 0, ve: 0, err: true };
  }
  const theta = Math.atan2(y, x);
  const { M, capped } = chooseTailDepth(rho, tol);
  let valSum = 0.0;
  for (let k = 1; k <= M; k++) {
    valSum += Math.pow(rho, -k) * Math.abs(Math.sin(k * theta));
  }
  const tail = Math.pow(rho, -M) / (rho - 1.0);
  const ve = (m - 1) * (valSum + tail);
  const se = (m - 1) * Math.abs(y) / rho + ve / rho;
  return {
    se,
    ve,
    err: false,
    truncationDepth: M,
    tail,
    tailCertifiedToTol: tail <= tol,
    tailCapHit: capped
  };
}

export function getTrapHalfWidths(x, y, m, isLens) {
  const eff = getEffectiveC(x, y);
  x = eff.x;
  y = eff.y;
  const rho = Math.hypot(x, y);
  if (isLens) {
    return {
      S: (m * Math.abs(y)) / rho,
      V: Math.max(0.0, ((m - 2 * Math.abs(x)) * Math.abs(y)) / (rho * rho))
    };
  }
  const nPrime = (m + 1) / 2.0;
  const kappa = nPrime > 7 ? (1 + Math.floor(-2.0 - 2.0 * Math.sqrt(nPrime) + nPrime)) : 1;
  return {
    S: ((m - 1) * Math.abs(y)) / rho,
    V: (kappa * Math.abs(y)) / (rho * rho)
  };
}

export function inverseIterationTestDetailed(x, y, n, kMax = 37, LMax = 1000, tol = 1e-8) {
  const eff = getEffectiveC(x, y);
  x = eff.x;
  y = eff.y;
  const rho = Math.hypot(x, y);
  if (rho <= 1.0 || y === 0.0) {
    return { verdict: 'Undetermined', depth: 0, nodesExplored: 0, word: [] };
  }

  const N = 2 * n - 1;
  const isLens = inLens(x, y, n);
  const enc = computeEnclosureGeneral(x, y, N, tol);
  if (enc.err) {
    return { verdict: 'Undetermined', depth: 0, nodesExplored: 0, word: [] };
  }
  const { se, ve } = enc;
  const { S, V } = getTrapHalfWidths(x, y, N, isLens);
  const s0 = (4 * x * y) / rho;
  const v0 = 2 * y;
  const initialNode = { s: s0, v: v0, depth: 0, parentIdx: -1, t: 0 };
  const tree = [[initialNode]];

  if (Math.abs(s0) > se || Math.abs(v0) > ve) {
    return { verdict: 'Exterior', depth: 0, word: [], nodesExplored: 1, tree };
  }
  if (Math.abs(s0) < S && Math.abs(v0) < V) {
    return {
      verdict: interiorVerdict(isLens),
      depth: 0,
      word: [],
      nodesExplored: 1,
      tree,
      trapRegion: isLens ? 'lens' : 'off-lens'
    };
  }

  let totalNodes = 1;
  for (let k = 1; k <= kMax; k++) {
    const previous = tree[k - 1];
    const next = [];
    for (let pIdx = 0; pIdx < previous.length; pIdx++) {
      const node = previous[pIdx];
      const t1 = (rho * node.s - ve) / y;
      const t2 = (rho * node.s + ve) / y;
      const tMin = Math.min(t1, t2);
      const tMax = Math.max(t1, t2);
      const a = Math.max(-N + 1, Math.ceil(tMin));
      const b = Math.min(N - 1, Math.floor(tMax));
      if (a > b) continue;
      for (let t = firstAlphabetDigitAtOrAbove(a, N); t <= b; t += 2) {
        const vPrime = rho * node.s - y * t;
        const sPrime = (2 * x / rho) * vPrime - rho * node.v;
        if (Math.abs(sPrime) > se) continue;
        const nextNode = { s: sPrime, v: vPrime, depth: k, parentIdx: pIdx, t };
        if (Math.abs(sPrime) < S && Math.abs(vPrime) < V) {
          next.push(nextNode);
          tree.push(next);
          const path = [];
          let curr = nextNode;
          let d = k;
          while (curr && curr.parentIdx !== -1) {
            path.unshift(curr.t);
            curr = tree[d - 1][curr.parentIdx];
            d--;
          }
          return {
            verdict: interiorVerdict(isLens),
            depth: k,
            word: path,
            nodesExplored: totalNodes + next.length,
            tree,
            trapRegion: isLens ? 'lens' : 'off-lens'
          };
        }
        next.push(nextNode);
        if (next.length >= LMax) {
          tree.push(next);
          return { verdict: 'Undetermined', depth: k, word: [], nodesExplored: totalNodes + next.length, tree };
        }
      }
    }
    totalNodes += next.length;
    if (next.length === 0) {
      return { verdict: 'Exterior', depth: k, word: [], nodesExplored: totalNodes, tree };
    }
    tree.push(next);
  }
  return { verdict: 'Undetermined', depth: kMax, word: [], nodesExplored: totalNodes, tree };
}
