classdef collinear_fractals
    % COLLINEAR_FRACTALS Companion software for collinear fractals.
    % Separates in-lens trap hits ('Interior') from off-lens trap hits
    % ('Interior-offLens').

    methods (Static)
        function [ls, lv] = get_canonical_coordinates(u, c)
            rho = abs(c);
            if rho == 0
                error('c must be nonzero.');
            end
            lv = imag(u);
            ls = (real(c) * imag(u) + imag(c) * real(u)) / rho;
        end

        function res = in_lens(c, n)
            rho = abs(c);
            N = 2 * n - 1;
            res = (rho > 1.0) && (imag(c) ~= 0.0) && ((rho * rho + 2.0 * abs(real(c))) < N);
        end

        function [M, capped] = choose_tail_depth(rho, tol, min_m, max_m)
            if nargin < 2, tol = 1e-8; end
            if nargin < 3, min_m = 30; end
            if nargin < 4, max_m = 2000; end
            if rho <= 1.0
                error('rho must be greater than 1.');
            end
            if tol <= 0.0
                error('tol must be positive.');
            end
            target = -log(tol * (rho - 1.0)) / log(rho);
            M = max(min_m, ceil(target));
            capped = M > max_m;
            if capped
                M = max_m;
            end
        end

        function [se, ve, meta] = compute_enclosure(c, n, tol)
            if nargin < 3, tol = 1e-8; end
            rho = abs(c);
            if rho <= 1.0 || imag(c) == 0.0
                error('c must satisfy |c| > 1 and Im(c) != 0.');
            end

            theta = atan2(imag(c), real(c));
            N_minus_1 = 2 * n - 2;
            [M, capped] = collinear_fractals.choose_tail_depth(rho, tol);

            val_sum = 0.0;
            for k = 1:M
                val_sum = val_sum + (rho ^ -k) * abs(sin(k * theta));
            end

            tail = (rho ^ -M) / (rho - 1.0);
            ve = N_minus_1 * (val_sum + tail);
            se = N_minus_1 * abs(imag(c)) / rho + ve / rho;
            meta = struct('truncation_depth', M, 'tail', tail, ...
                          'tail_certified_to_tol', tail <= tol, 'tail_cap_hit', capped);
        end

        function trap = get_trap_half_widths(c, n)
            rho = abs(c);
            N = 2 * n - 1;
            if collinear_fractals.in_lens(c, n)
                trap = struct('S', (N * abs(imag(c))) / rho, ...
                              'V', max(0.0, ((N - 2.0 * abs(real(c))) * abs(imag(c))) / (rho * rho)), ...
                              'region', 'lens');
            else
                n_prime = (N + 1) / 2.0;
                if n_prime > 7
                    kappa = 1 + floor(-2.0 - 2.0 * sqrt(n_prime) + n_prime);
                else
                    kappa = 1;
                end
                trap = struct('S', ((N - 1) * abs(imag(c))) / rho, ...
                              'V', (kappa * abs(imag(c))) / (rho * rho), ...
                              'region', 'off-lens');
            end
        end

        function t = first_alphabet_digit_at_or_above(a, m)
            parity = mod(m - 1, 2);
            t = ceil(a);
            if mod(t - parity, 2) ~= 0
                t = t + 1;
            end
        end

        function verdict = interior_verdict(is_lens)
            if is_lens
                verdict = 'Interior';
            else
                verdict = 'Interior-offLens';
            end
        end

        function result = inverse_iteration_test(c, n, k_max, l_max, tol)
            if nargin < 3, k_max = 37; end
            if nargin < 4, l_max = 1000; end
            if nargin < 5, tol = 1e-8; end

            rho = abs(c);
            if rho <= 1.0 || imag(c) == 0.0
                result = struct('verdict', 'Undetermined', 'depth', 0, 'nodes_explored', 0, ...
                                'reason', 'c outside domain (|c| > 1 and Im(c) != 0)');
                return;
            end

            N = 2 * n - 1;
            is_lens = collinear_fractals.in_lens(c, n);

            try
                [se, ve] = collinear_fractals.compute_enclosure(c, n, tol);
            catch ME
                result = struct('verdict', 'Undetermined', 'depth', 0, 'nodes_explored', 0, ...
                                'reason', ME.message);
                return;
            end

            trap = collinear_fractals.get_trap_half_widths(c, n);
            S = trap.S;
            V = trap.V;
            trap_region = trap.region;

            s0 = (4.0 * real(c) * imag(c)) / rho;
            v0 = 2.0 * imag(c);

            if abs(s0) > se || abs(v0) > ve
                result = struct('verdict', 'Exterior', 'depth', 0, 'nodes_explored', 1);
                return;
            end

            if abs(s0) < S && abs(v0) < V
                result = struct('verdict', collinear_fractals.interior_verdict(is_lens), ...
                                'depth', 0, 'nodes_explored', 1, 'trap_region', trap_region);
                return;
            end

            W = {struct('s', s0, 'v', v0, 'word', [])};
            total_nodes = 1;

            for k = 1:k_max
                W_prime = {};
                for idx = 1:length(W)
                    node = W{idx};
                    t1 = (rho * node.s - ve) / imag(c);
                    t2 = (rho * node.s + ve) / imag(c);
                    t_min = min(t1, t2);
                    t_max = max(t1, t2);

                    a = max(-N + 1, ceil(t_min));
                    b = min(N - 1, floor(t_max));

                    if a <= b
                        t_start = collinear_fractals.first_alphabet_digit_at_or_above(a, N);
                        for t = t_start:2:b
                            v_prime = rho * node.s - imag(c) * t;
                            s_prime = (2.0 * real(c) / rho) * v_prime - rho * node.v;

                            if abs(s_prime) <= se
                                next_word = [node.word, t];
                                if abs(s_prime) < S && abs(v_prime) < V
                                    result = struct('verdict', collinear_fractals.interior_verdict(is_lens), ...
                                                    'depth', k, 'word', next_word, ...
                                                    'nodes_explored', total_nodes + length(W_prime) + 1, ...
                                                    'trap_region', trap_region);
                                    return;
                                end
                                W_prime{end+1} = struct('s', s_prime, 'v', v_prime, 'word', next_word);
                                if length(W_prime) >= l_max
                                    result = struct('verdict', 'Undetermined', 'depth', k, ...
                                                    'nodes_explored', total_nodes + length(W_prime));
                                    return;
                                end
                            end
                        end
                    end
                end

                total_nodes = total_nodes + length(W_prime);
                if isempty(W_prime)
                    result = struct('verdict', 'Exterior', 'depth', k, 'nodes_explored', total_nodes);
                    return;
                end
                W = W_prime;
            end

            result = struct('verdict', 'Undetermined', 'depth', k_max, 'nodes_explored', total_nodes);
        end
    end
end
