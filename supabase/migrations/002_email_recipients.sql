-- Email distribution list per profile
CREATE TABLE email_recipients (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  email      text NOT NULL,
  name       text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(profile_id, email)
);

ALTER TABLE email_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own recipients" ON email_recipients
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_email_recipients_profile ON email_recipients(profile_id);
