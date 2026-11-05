-- V60 invariants that span rows, enforced at COMMIT (deferred) so a transaction may rewrite pours freely:
--   * a v60 brew has its brew_v60 block,
--   * it has at least one pour, with indexes 1..n and no gaps,
--   * brews.water_g equals the sum of its pours (D12).
-- Violations raise SQLSTATE 23514 (check_violation), like the table CHECK constraints.

CREATE FUNCTION check_v60_brew(p_brew_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
	b record;
	n integer;
	max_idx integer;
	total numeric;
BEGIN
	SELECT id, method, water_g INTO b FROM brews WHERE id = p_brew_id;
	IF NOT FOUND OR b.method <> 'v60' THEN
		RETURN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM brew_v60 WHERE brew_id = p_brew_id) THEN
		RAISE EXCEPTION 'v60 brew % has no brew_v60 block', p_brew_id USING ERRCODE = '23514';
	END IF;
	SELECT count(*), max(idx), coalesce(sum(volume_g), 0) INTO n, max_idx, total
	FROM pours WHERE brew_id = p_brew_id;
	IF n = 0 THEN
		RAISE EXCEPTION 'v60 brew % has no pours', p_brew_id USING ERRCODE = '23514';
	END IF;
	IF max_idx <> n THEN
		RAISE EXCEPTION 'pours of brew % are not numbered 1..%', p_brew_id, n USING ERRCODE = '23514';
	END IF;
	IF total <> b.water_g THEN
		RAISE EXCEPTION 'brew % water_g (%) differs from the sum of its pours (%)', p_brew_id, b.water_g, total
			USING ERRCODE = '23514';
	END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION trg_check_v60_brew() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_TABLE_NAME = 'brews' THEN
		PERFORM check_v60_brew(NEW.id);
	ELSIF TG_OP = 'DELETE' THEN
		PERFORM check_v60_brew(OLD.brew_id);
	ELSE
		PERFORM check_v60_brew(NEW.brew_id);
		IF TG_OP = 'UPDATE' AND OLD.brew_id <> NEW.brew_id THEN
			PERFORM check_v60_brew(OLD.brew_id);
		END IF;
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER brews_v60_invariants
	AFTER INSERT OR UPDATE ON brews
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION trg_check_v60_brew();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER pours_v60_invariants
	AFTER INSERT OR UPDATE OR DELETE ON pours
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION trg_check_v60_brew();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER brew_v60_invariants
	AFTER INSERT OR UPDATE OR DELETE ON brew_v60
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION trg_check_v60_brew();
