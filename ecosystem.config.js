require('dotenv').config();

module.exports = {
  apps: [
    {
      name: 'voice-annotation-api',
      script: './venv/bin/uvicorn',
      args: 'main:app --host 0.0.0.0 --port 8000 --workers 4',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PYTHONUNBUFFERED: 1,
        DATABASE_URL: process.env.DATABASE_URL || 'mysql+pymysql://voice_admin:password@localhost:3306/voice_db',
        STORAGE_TYPE: process.env.STORAGE_TYPE || 'aliyun',
        ALIYUN_ACCESS_KEY_ID: process.env.ALIYUN_ACCESS_KEY_ID || 'your_aliyun_access_key_id',
        ALIYUN_ACCESS_KEY_SECRET: process.env.ALIYUN_ACCESS_KEY_SECRET || 'your_aliyun_access_key_secret',
        ALIYUN_BUCKET_NAME: process.env.ALIYUN_BUCKET_NAME || 'your_bucket_name',
        ALIYUN_ENDPOINT: process.env.ALIYUN_ENDPOINT || 'oss-cn-beijing.aliyuncs.com',
        SUPER_ADMIN_USERNAME: process.env.SUPER_ADMIN_USERNAME || 'admin',
        SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD || 'admin123',
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      watch: false,
      max_memory_restart: '4G',
      listen_timeout: 5000,
      kill_timeout: 5000,
    },
    {
      name: 'voice-annotation-web',
      script: './node_modules/.bin/serve',
      args: '-s dist -l 3000 --no-clipboard --no-request-logging',
      cwd: './voice-h5',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      watch: false,
      max_memory_restart: '500M',
    }
  ]
};
