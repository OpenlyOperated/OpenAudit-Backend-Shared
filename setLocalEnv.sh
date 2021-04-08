export ENVIRONMENT="LOCAL"

export AWS_REGION="us-east-1"

# COMMON
export DOMAIN="exampledomain.com"
export PG_HOST="localhost"
export PG_PASSWORD="admin_pw"
export AES_EMAIL_KEY="00000000000000000000000000000000"
export EMAIL_SALT="11111111111111111111111111111111"
export REDIS_HOST="localhost"
export REDIS_SALT="testRedisSalt"
export REDIS_PASSWORD="testRedisPassword"

# MAIN
export PG_MAIN_PASSWORD="main_pw"
export USER_SESSION_SECRET="local_user_session_secret"

# ADMIN
export ALLOWED_IP="192.168.0.0/32"
export PG_ADMIN_PASSWORD="admin_pw"
export ADMIN_SESSION_SECRET="test_admin_session_secret"

# DEBUG
export PG_DEBUG_PASSWORD="debug_pw"
