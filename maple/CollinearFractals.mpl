CollinearFractals := module()
    description "Companion Software for Collinear Fractals";
    export get_canonical_coordinates, in_lens, choose_tail_depth, compute_enclosure,
           get_trap_half_widths, first_alphabet_digit_at_or_above, inverse_iteration_test;

    get_canonical_coordinates := proc(u::complex, c::complex)
        local rho, lv, ls;
        rho := abs(c);
        if rho = 0 then error "c must be nonzero"; end if;
        lv := Im(u);
        ls := (Re(c)*Im(u) + Im(c)*Re(u)) / rho;
        return [ls, lv];
    end proc;

    in_lens := proc(c::complex, n::integer)
        local rho, N;
        rho := abs(c);
        N := 2*n - 1;
        return evalb(rho > 1.0 and Im(c) <> 0.0 and (rho*rho + 2.0*abs(Re(c)) < N));
    end proc;

    choose_tail_depth := proc(rho::float, tol::float := 1e-8, min_m::integer := 30, max_m::integer := 2000)
        local target, M, capped;
        if rho <= 1.0 then error "rho must be greater than 1"; end if;
        if tol <= 0.0 then error "tol must be positive"; end if;
        target := -log(tol*(rho - 1.0))/log(rho);
        M := max(min_m, ceil(target));
        capped := evalb(M > max_m);
        if capped then M := max_m; end if;
        return [M, capped];
    end proc;

    compute_enclosure := proc(c::complex, n::integer, tol::float := 1e-8)
        local rho, theta, N_minus_1, depth, M, capped, val_sum, tail, ve, se, k;
        rho := abs(c);
        if rho <= 1.0 or Im(c) = 0.0 then
            error "c must satisfy |c| > 1 and Im(c) != 0.";
        end if;

        theta := argument(c);
        N_minus_1 := 2*n - 2;
        depth := choose_tail_depth(rho, tol);
        M := depth[1]; capped := depth[2];

        val_sum := 0.0;
        for k from 1 to M do
            val_sum := val_sum + (rho^(-k))*abs(sin(k*theta));
        end do;

        tail := (rho^(-M))/(rho - 1.0);
        ve := N_minus_1*(val_sum + tail);
        se := N_minus_1*abs(Im(c))/rho + ve/rho;

        return table(["se"=se, "ve"=ve, "truncation_depth"=M,
                      "tail"=tail, "tail_certified_to_tol"=evalb(tail <= tol),
                      "tail_cap_hit"=capped]);
    end proc;

    get_trap_half_widths := proc(c::complex, n::integer)
        local rho, N, n_prime, kappa;
        rho := abs(c); N := 2*n - 1;
        if in_lens(c, n) then
            return table(["S"=(N*abs(Im(c)))/rho,
                          "V"=max(0.0, ((N - 2.0*abs(Re(c)))*abs(Im(c)))/(rho*rho)),
                          "region"="lens"]);
        else
            n_prime := (N + 1)/2.0;
            if n_prime > 7 then
                kappa := 1 + floor(-2.0 - 2.0*sqrt(n_prime) + n_prime);
            else
                kappa := 1;
            end if;
            return table(["S"=((N - 1)*abs(Im(c)))/rho,
                          "V"=(kappa*abs(Im(c)))/(rho*rho),
                          "region"="off-lens"]);
        end if;
    end proc;

    first_alphabet_digit_at_or_above := proc(a, m::integer)
        local parity, t;
        parity := irem(m - 1, 2);
        t := ceil(a);
        if irem(t - parity, 2) <> 0 then t := t + 1; end if;
        return t;
    end proc;

    inverse_iteration_test := proc(c::complex, n::integer, k_max::integer := 37, l_max::integer := 1000, tol::float := 1e-8)
        local rho, N, is_lens, enc, se, ve, trap, S, V, trap_region, s0, v0, W,
              total_nodes, k, W_prime, node, s, v, word, t1, t2, t_min, t_max,
              a, b, t_start, t, v_prime, s_prime, next_word, idx, verdict;
        rho := abs(c);
        if rho <= 1.0 or Im(c) = 0.0 then
            return table(["verdict"="Undetermined", "depth"=0, "nodes_explored"=0,
                          "reason"="c outside domain (|c| > 1 and Im(c) != 0)"]);
        end if;

        N := 2*n - 1;
        is_lens := in_lens(c, n);

        try
            enc := compute_enclosure(c, n, tol);
            se := enc["se"];
            ve := enc["ve"];
        catch:
            return table(["verdict"="Undetermined", "depth"=0, "nodes_explored"=0,
                          "reason"=String(lastexception)]);
        end try;

        trap := get_trap_half_widths(c, n);
        S := trap["S"]; V := trap["V"]; trap_region := trap["region"];
        verdict := proc(flag) if flag then return "Interior"; else return "Interior-offLens"; end if; end proc;

        s0 := (4.0*Re(c)*Im(c))/rho;
        v0 := 2.0*Im(c);

        if abs(s0) > se or abs(v0) > ve then
            return table(["verdict"="Exterior", "depth"=0, "nodes_explored"=1]);
        end if;

        if abs(s0) < S and abs(v0) < V then
            return table(["verdict"=verdict(is_lens), "depth"=0, "nodes_explored"=1,
                          "trap_region"=trap_region]);
        end if;

        W := [[s0, v0, []]];
        total_nodes := 1;

        for k from 1 to k_max do
            W_prime := [];
            for idx from 1 to nops(W) do
                node := W[idx];
                s := node[1]; v := node[2]; word := node[3];
                t1 := (rho*s - ve)/Im(c);
                t2 := (rho*s + ve)/Im(c);
                t_min := min(t1, t2); t_max := max(t1, t2);
                a := max(-N + 1, ceil(t_min));
                b := min(N - 1, floor(t_max));

                if a <= b then
                    t_start := first_alphabet_digit_at_or_above(a, N);
                    for t from t_start by 2 to b do
                        v_prime := rho*s - Im(c)*t;
                        s_prime := (2.0*Re(c)/rho)*v_prime - rho*v;
                        if abs(s_prime) <= se then
                            next_word := [op(word), t];
                            if abs(s_prime) < S and abs(v_prime) < V then
                                return table(["verdict"=verdict(is_lens), "depth"=k,
                                              "word"=next_word,
                                              "nodes_explored"=(total_nodes + nops(W_prime) + 1),
                                              "trap_region"=trap_region]);
                            end if;
                            W_prime := [op(W_prime), [s_prime, v_prime, next_word]];
                            if nops(W_prime) >= l_max then
                                return table(["verdict"="Undetermined", "depth"=k,
                                              "nodes_explored"=(total_nodes + nops(W_prime))]);
                            end if;
                        end if;
                    end do;
                end if;
            end do;

            total_nodes := total_nodes + nops(W_prime);
            if nops(W_prime) = 0 then
                return table(["verdict"="Exterior", "depth"=k, "nodes_explored"=total_nodes]);
            end if;
            W := W_prime;
        end do;

        return table(["verdict"="Undetermined", "depth"=k_max, "nodes_explored"=total_nodes]);
    end proc;
end module;
