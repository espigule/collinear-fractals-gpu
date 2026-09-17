(* Run TestReport["test_collinear.wlt"] from mathematica/. *)
Get["CollinearFractals.wl"];

VerificationTest[
  Max[Abs[CollinearCanonicalCoordinates[1. + I, 0.6 + 0.8 I] - {1.4, 1.}]] < 10^-12,
  True, TestID -> "canonical coordinates"
]
VerificationTest[
  Max[Abs[CollinearComputeEnclosure[0.7 + 1.4 I, 3] - {6.876046013381387, 5.162714411636048}]] < 10^-9,
  True, TestID -> "analytic enclosure evaluation"
]
VerificationTest[
  CollinearInverseIterationTest[1.419643377607 + 0.606290729207 I, 3]["Word"],
  {4, 0}, TestID -> "off-lens witness"
]
VerificationTest[
  CollinearInverseIterationTest[1.419643377607 + 0.606290729207 I, 3, 0]["StopReason"],
  "depth-cap", TestID -> "zero depth"
]
VerificationTest[
  CollinearInverseIterationTest[1.419643377607 + 0.606290729207 I, 3, 37, 1]["StopReason"],
  "node-cap", TestID -> "frontier cap"
]
VerificationTest[
  CollinearInverseIterationTest[3. + 3. I, 1]["StopReason"],
  "invalid-input", TestID -> "invalid order rejected before enclosure escape"
]
VerificationTest[
  CollinearChooseTailDepth[1.1, 10^-8, 30, 29],
  $Failed, TestID -> "invalid tail limits"
]
