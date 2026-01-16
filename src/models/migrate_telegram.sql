-- Migration script to add Telegram support to existing database
-- Run this on your existing database

-- Step 1: Add new columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(50) UNIQUE,
ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(100),
ADD COLUMN IF NOT EXISTS login_method VARCHAR(20) DEFAULT 'whatsapp';

-- Step 2: Update existing users to have login_method = 'whatsapp'
UPDATE users 
SET login_method = 'whatsapp' 
WHERE phone_number IS NOT NULL AND login_method IS NULL;

-- Step 3: Make phone_number nullable (since telegram users won't have it)
ALTER TABLE users ALTER COLUMN phone_number DROP NOT NULL;

-- Step 4: Add constraint to ensure either phone or telegram is present
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_contact_method;
ALTER TABLE users ADD CONSTRAINT check_contact_method CHECK (
    (phone_number IS NOT NULL AND login_method = 'whatsapp') OR
    (telegram_chat_id IS NOT NULL AND login_method = 'telegram')
);

-- Step 5: Add new columns to alert_history table
ALTER TABLE alert_history 
ADD COLUMN IF NOT EXISTS telegram_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sent_via VARCHAR(20);

-- Step 6: Update existing alert_history to mark sent_via
UPDATE alert_history 
SET sent_via = 'whatsapp' 
WHERE whatsapp_sent = TRUE AND sent_via IS NULL;

-- Step 7: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_users_login_method ON users(login_method);

-- Step 8: Verify migration
SELECT 
    COUNT(*) as total_users,
    COUNT(phone_number) as whatsapp_users,
    COUNT(telegram_chat_id) as telegram_users,
    COUNT(CASE WHEN login_method = 'whatsapp' THEN 1 END) as whatsapp_method,
    COUNT(CASE WHEN login_method = 'telegram' THEN 1 END) as telegram_method
FROM users;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Migration completed successfully!';
    RAISE NOTICE 'Database is now ready for Telegram integration.';
END $$;