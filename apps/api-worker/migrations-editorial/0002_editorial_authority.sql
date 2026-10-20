/* Which runtime owns editorial writes; only `worker` opens the Worker's Media and Blog routes. Promotion is a reviewed cutover step. */ CREATE TABLE editorial_authority ( id INTEGER PRIMARY KEY CHECK (id = 1), authority TEXT NOT NULL CHECK (authority IN ('legacy','worker')) );
INSERT INTO editorial_authority (id, authority) VALUES (1, 'legacy');
CREATE TRIGGER editorial_authority_no_rollback BEFORE UPDATE OF authority ON editorial_authority WHEN OLD.authority = 'worker' AND NEW.authority != 'worker' BEGIN SELECT RAISE(ABORT, 'Editorial authority cannot return to legacy'); END;
CREATE TRIGGER editorial_authority_no_delete BEFORE DELETE ON editorial_authority BEGIN SELECT RAISE(ABORT, 'Editorial authority cannot be deleted'); END;
