(* ::Package:: *)

BeginPackage["CollinearFractals`"]

CollinearCanonicalCoordinates::usage = "CollinearCanonicalCoordinates[u, c] returns {ls, lv}.";
CollinearInLensQ::usage = "CollinearInLensQ[c, n] tests the non-real lens X_n \\ R.";
CollinearChooseTailDepth::usage = "CollinearChooseTailDepth[rho, tol] chooses a truncation depth for the enclosure tail.";
CollinearComputeEnclosure::usage = "CollinearComputeEnclosure[c, n, tol] returns {se, ve}.";
CollinearComputeEnclosureDetails::usage = "CollinearComputeEnclosureDetails[c, n, tol] returns an Association with enclosure metadata.";
CollinearFirstAlphabetDigitAtOrAbove::usage = "CollinearFirstAlphabetDigitAtOrAbove[a, m] gives the first digit of A_m not below a.";
CollinearInverseIterationTest::usage = "CollinearInverseIterationTest[c, n, kmax, lmax, tol] runs the inverse search. Default kmax is 37.";

Begin["`Private`"]

CollinearCanonicalCoordinates[u_, c_] := Module[{rho = Abs[c]},
  If[rho == 0, Return[$Failed]];
  {(Re[c] Im[u] + Im[c] Re[u])/rho, Im[u]}
]

CollinearInLensQ[c_, n_Integer] := Module[{rho = Abs[c], N = 2 n - 1},
  rho > 1 && Im[c] != 0 && rho^2 + 2 Abs[Re[c]] < N
]

CollinearChooseTailDepth[rho_, tol_:10^-8, minM_:30, maxM_:2000] := Module[{target, M, capped},
  If[rho <= 1 || tol <= 0, Return[$Failed]];
  target = -Log[tol (rho - 1)]/Log[rho];
  M = Max[minM, Ceiling[target]];
  capped = M > maxM;
  If[capped, M = maxM];
  <|"M" -> M, "Capped" -> capped|>
]

CollinearComputeEnclosureDetails[c_, n_Integer, tol_:10^-8] := Module[
  {rho = Abs[c], theta, nMinus1, depth, M, capped, valSum, tail, ve, se},
  If[rho <= 1 || Im[c] == 0,
    Message[CollinearComputeEnclosure::domain];
    Return[$Failed]
  ];
  theta = ArcTan[Re[c], Im[c]];
  nMinus1 = 2 n - 2;
  depth = CollinearChooseTailDepth[rho, tol];
  If[depth === $Failed, Return[$Failed]];
  M = depth["M"]; capped = depth["Capped"];
  valSum = Sum[rho^-k Abs[Sin[k theta]], {k, 1, M}];
  tail = rho^-M/(rho - 1);
  ve = nMinus1 (valSum + tail);
  se = nMinus1 Abs[Im[c]]/rho + ve/rho;
  <|"se" -> se, "ve" -> ve, "TruncationDepth" -> M, "Tail" -> tail,
    "TailCertifiedToTol" -> (tail <= tol), "TailCapHit" -> capped|>
]
CollinearComputeEnclosure::domain = "Parameter c must satisfy Abs[c] > 1 and Im[c] != 0.";

CollinearComputeEnclosure[c_, n_Integer, tol_:10^-8] := Module[{d = CollinearComputeEnclosureDetails[c, n, tol]},
  If[d === $Failed, $Failed, {d["se"], d["ve"]}]
]

CollinearTrapHalfWidths[c_, n_Integer] := Module[{rho = Abs[c], N = 2 n - 1, nPrime, kappa},
  If[CollinearInLensQ[c, n],
    <|"S" -> N Abs[Im[c]]/rho,
      "V" -> Max[0, (N - 2 Abs[Re[c]]) Abs[Im[c]]/rho^2],
      "Region" -> "lens"|>,
    nPrime = (N + 1)/2.0;
    kappa = If[nPrime > 7, 1 + Floor[-2.0 - 2.0 Sqrt[nPrime] + nPrime], 1];
    <|"S" -> (N - 1) Abs[Im[c]]/rho,
      "V" -> kappa Abs[Im[c]]/rho^2,
      "Region" -> "off-lens"|>
  ]
]

CollinearFirstAlphabetDigitAtOrAbove[a_, m_Integer] := Module[{parity, t},
  parity = Mod[m - 1, 2];
  t = Ceiling[a];
  If[Mod[t - parity, 2] != 0, t++];
  t
]

interiorVerdict[isLens_] := If[TrueQ[isLens], "Interior", "Interior-offLens"]

CollinearInverseIterationTest[c_, n_Integer, kmax_:37, lmax_:1000, tol_:10^-8] := Catch[
  Module[
    {rho = Abs[c], N = 2 n - 1, isLens, enc, se, ve, trap, S, V, trapRegion,
     s0, v0, W, totalNodes = 1, Wprime, s, v, word, t1, t2, tMin, tMax,
     a, b, tStart, vPrime, sPrime, nextWord},

    If[rho <= 1 || Im[c] == 0,
      Throw[<|"Verdict" -> "Undetermined", "Depth" -> 0, "NodesExplored" -> 0,
        "Reason" -> "c outside domain (|c| > 1 and Im[c] != 0)"|>]
    ];

    isLens = CollinearInLensQ[c, n];
    enc = CollinearComputeEnclosure[c, n, tol];
    If[enc === $Failed,
      Throw[<|"Verdict" -> "Undetermined", "Depth" -> 0, "NodesExplored" -> 0,
        "Reason" -> "Failed to compute enclosure"|>]
    ];
    {se, ve} = enc;

    trap = CollinearTrapHalfWidths[c, n];
    S = trap["S"]; V = trap["V"]; trapRegion = trap["Region"];

    s0 = 4 Re[c] Im[c]/rho;
    v0 = 2 Im[c];

    If[Abs[s0] > se || Abs[v0] > ve,
      Throw[<|"Verdict" -> "Exterior", "Depth" -> 0, "NodesExplored" -> 1|>]
    ];

    If[Abs[s0] < S && Abs[v0] < V,
      Throw[<|"Verdict" -> interiorVerdict[isLens], "Depth" -> 0, "NodesExplored" -> 1,
        "TrapRegion" -> trapRegion|>]
    ];

    W = {{s0, v0, {}}};

    Do[
      Wprime = {};
      Do[
        s = node[[1]]; v = node[[2]]; word = node[[3]];
        t1 = (rho s - ve)/Im[c];
        t2 = (rho s + ve)/Im[c];
        tMin = Min[t1, t2]; tMax = Max[t1, t2];
        a = Max[-N + 1, Ceiling[tMin]];
        b = Min[N - 1, Floor[tMax]];
        If[a <= b,
          tStart = CollinearFirstAlphabetDigitAtOrAbove[a, N];
          Do[
            vPrime = rho s - Im[c] t;
            sPrime = (2 Re[c]/rho) vPrime - rho v;
            If[Abs[sPrime] <= se,
              nextWord = Append[word, t];
              If[Abs[sPrime] < S && Abs[vPrime] < V,
                Throw[<|"Verdict" -> interiorVerdict[isLens], "Depth" -> k,
                  "Word" -> nextWord, "NodesExplored" -> totalNodes + Length[Wprime] + 1,
                  "TrapRegion" -> trapRegion|>]
              ];
              AppendTo[Wprime, {sPrime, vPrime, nextWord}];
              If[Length[Wprime] >= lmax,
                Throw[<|"Verdict" -> "Undetermined", "Depth" -> k,
                  "NodesExplored" -> totalNodes + Length[Wprime]|>]
              ]
            ],
            {t, tStart, b, 2}
          ]
        ],
        {node, W}
      ];
      totalNodes += Length[Wprime];
      If[Length[Wprime] == 0,
        Throw[<|"Verdict" -> "Exterior", "Depth" -> k, "NodesExplored" -> totalNodes|>]
      ];
      W = Wprime,
      {k, 1, kmax}
    ];

    <|"Verdict" -> "Undetermined", "Depth" -> kmax, "NodesExplored" -> totalNodes|>
  ]
]

End[]

EndPackage[]
