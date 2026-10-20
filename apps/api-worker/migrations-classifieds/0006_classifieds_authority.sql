CREATE TABLE classifieds_authority (id INTEGER PRIMARY KEY CHECK (id = 1), authority TEXT NOT NULL CHECK (authority IN ('legacy', 'worker')));
INSERT INTO classifieds_authority (id, authority) VALUES (1, 'legacy');
CREATE TRIGGER classifieds_authority_no_rollback BEFORE UPDATE OF authority ON classifieds_authority WHEN OLD.authority = 'worker' AND NEW.authority != 'worker' BEGIN SELECT RAISE(ABORT, 'Classifieds authority cannot return to legacy'); END;
CREATE TRIGGER classifieds_authority_no_delete BEFORE DELETE ON classifieds_authority BEGIN SELECT RAISE(ABORT, 'Classifieds authority cannot be deleted'); END;
