CREATE UNIQUE INDEX classifieds_personal_profile_owner ON classifieds_records (owner_id) WHERE kind = 'profile' AND json_extract(body, '$.identityType') = 'personal';
