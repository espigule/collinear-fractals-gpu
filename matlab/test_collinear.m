function test_collinear
% Run from matlab/ with test_collinear. These checks require MATLAB or Octave.
[ls, lv] = collinear_fractals.get_canonical_coordinates(1+1i, 0.6+0.8i);
assert(abs(ls - 1.4) < 1e-12 && lv == 1);
[se, ve] = collinear_fractals.compute_enclosure(0.7+1.4i, 3);
assert(abs(se - 6.876046013381387) < 1e-9);
assert(abs(ve - 5.162714411636048) < 1e-9);
c = complex(1.419643377607, 0.606290729207);
result = collinear_fractals.inverse_iteration_test(c, 3);
assert(strcmp(result.verdict, 'Interior-offLens') && isequal(result.word, [4, 0]));
zero = collinear_fractals.inverse_iteration_test(c, 3, 0);
assert(strcmp(zero.stop_reason, 'depth-cap') && zero.depth == 0);
capped = collinear_fractals.inverse_iteration_test(c, 3, 37, 1);
assert(strcmp(capped.stop_reason, 'node-cap') && capped.nodes_explored == 2);
[M, cap] = collinear_fractals.choose_tail_depth(1 + eps, realmin * eps);
assert(M == 2000 && cap);
assert_throws(@() collinear_fractals.inverse_iteration_test(3+3i, 1));
assert_throws(@() collinear_fractals.inverse_iteration_test(3+3i, 3, -1));
assert_throws(@() collinear_fractals.inverse_iteration_test(complex(NaN, 1), 3));
assert_throws(@() collinear_fractals.choose_tail_depth(1.1, 1e-8, 30, 29));
fprintf('MATLAB reference regression checks passed.\n');
end

function assert_throws(action)
failed = false;
try
    action();
catch
    failed = true;
end
assert(failed, 'Expected invalid input to raise an error.');
end
