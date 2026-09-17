# Run from maple/ with: maple test_collinear.mpl
read "CollinearFractals.mpl":
coords := CollinearFractals:-get_canonical_coordinates(1.0+1.0*I, 0.6+0.8*I):
if abs(coords[1]-1.4) > 1e-8 then error "canonical coordinates"; end if:
enc := CollinearFractals:-compute_enclosure(0.7+1.4*I, 3):
if abs(enc["se"]-6.876046013381387) > 1e-7 then error "enclosure"; end if:
c := 1.419643377607+0.606290729207*I:
result := CollinearFractals:-inverse_iteration_test(c, 3):
if result["verdict"] <> "Interior-offLens" or result["word"] <> [4,0] then error "off-lens witness"; end if:
zero := CollinearFractals:-inverse_iteration_test(c, 3, 0):
if zero["stop_reason"] <> "depth-cap" then error "zero depth"; end if:
capped := CollinearFractals:-inverse_iteration_test(c, 3, 37, 1):
if capped["stop_reason"] <> "node-cap" then error "frontier cap"; end if:
expect_error := proc(f)
    local failed;
    failed := false;
    try f(); catch: failed := true; end try;
    if not failed then error "invalid input must raise an error"; end if;
end proc:
expect_error(proc() CollinearFractals:-inverse_iteration_test(3.0+3.0*I, 1); end proc):
expect_error(proc() CollinearFractals:-inverse_iteration_test(3.0+3.0*I, 3, -1); end proc):
expect_error(proc() CollinearFractals:-choose_tail_depth(1.1, 1e-8, 30, 29); end proc):
printf("Maple reference regression checks passed.\n"):
