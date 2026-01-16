-- Users table (Updated with Telegram support)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    phone_number VARCHAR(15) UNIQUE,
    telegram_chat_id VARCHAR(50) UNIQUE,
    telegram_username VARCHAR(100),
    login_method VARCHAR(20) DEFAULT 'whatsapp', -- 'whatsapp' or 'telegram'
    otp VARCHAR(6),
    otp_expires_at TIMESTAMP,
    is_verified BOOLEAN DEFAULT FALSE,
    plan_type VARCHAR(20) DEFAULT 'starter',
    subscription_expires_at TIMESTAMP,
    last_payment_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    CONSTRAINT check_contact_method CHECK (
        (phone_number IS NOT NULL AND login_method = 'whatsapp') OR
        (telegram_chat_id IS NOT NULL AND login_method = 'telegram')
    )
);

-- Alert stocks (user's selected stocks for monitoring)
CREATE TABLE IF NOT EXISTS alert_stocks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    stock_symbol VARCHAR(20) NOT NULL,
    stock_name VARCHAR(255) NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, stock_symbol)
);

-- Alert history (sent alerts) - Updated for both WhatsApp and Telegram
CREATE TABLE IF NOT EXISTS alert_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    stock_symbol VARCHAR(20) NOT NULL,
    news_title VARCHAR(500),
    news_content TEXT,
    ai_summary TEXT,
    news_seq_id VARCHAR(50),
    whatsapp_sent BOOLEAN DEFAULT FALSE,
    telegram_sent BOOLEAN DEFAULT FALSE,
    sent_via VARCHAR(20), -- 'whatsapp' or 'telegram'
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sent news tracker (deduplication)
CREATE TABLE IF NOT EXISTS sent_news (
    id SERIAL PRIMARY KEY,
    news_seq_id VARCHAR(50) UNIQUE NOT NULL,
    stock_symbol VARCHAR(20) NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- News Feed (Forensic Feed Storage)
CREATE TABLE IF NOT EXISTS news_feed (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    attachment_link TEXT UNIQUE,
    is_red_flag BOOLEAN DEFAULT FALSE,
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Corporate Calendar Events
CREATE TABLE IF NOT EXISTS corporate_events (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    company_name VARCHAR(255),
    event_date DATE NOT NULL,
    event_type VARCHAR(50),
    purpose TEXT,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, event_date, purpose)
);

-- IPO Events Table
CREATE TABLE IF NOT EXISTS ipo_events (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(50),
    company_name VARCHAR(255),
    series VARCHAR(20),
    open_date VARCHAR(50),
    close_date VARCHAR(50),
    price_band VARCHAR(100),
    subscription_ratio VARCHAR(50),
    category VARCHAR(20),
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, category)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_alert_stocks_user ON alert_stocks(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_stocks_symbol ON alert_stocks(stock_symbol);
CREATE INDEX IF NOT EXISTS idx_alert_history_user ON alert_history(user_id);
CREATE INDEX IF NOT EXISTS idx_sent_news_seq ON sent_news(news_seq_id);
CREATE INDEX IF NOT EXISTS idx_corporate_events_date ON corporate_events(event_date);
CREATE INDEX IF NOT EXISTS idx_ipo_events_category ON ipo_events(category);
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_users_login_method ON users(login_method);