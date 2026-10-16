-- 1. Define the authorized platform roles
CREATE TYPE user_role AS ENUM (
    'Colbits administrator',
    'consultation user'
);

-- 2. Create the custom users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, 
    role user_role NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create the scope assignments table for consultation users
CREATE TABLE user_scopes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL, 
    entity_id TEXT NOT NULL, 
    UNIQUE(user_id, entity_type, entity_id)
);

-- 4. Create the token blacklist table for logout (SCRUM-147 / F-11)
CREATE TABLE token_blacklist (
    id SERIAL PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    invalidated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Insert test accounts (Both use the bcrypt hash for 'adminpassword')
INSERT INTO users (username, password_hash, role) 
VALUES 
    ('admin@colbits.com', E'$2b$10$qU/WlDIpMkzSurINwDX7mO9bD.Qoz3e1xwUSlVb3OrlyLAf0wvfJm', 'Colbits administrator'),
    ('client@colbits.com', E'$2b$10$qU/WlDIpMkzSurINwDX7mO9bD.Qoz3e1xwUSlVb3OrlyLAf0wvfJm', 'consultation user');

-- 6. Assign sample scope to the consultation user
INSERT INTO user_scopes (user_id, entity_type, entity_id) 
VALUES 
    (2, 'circuit', 'CTO 1'),
    (2, 'node', '0000100001');