# 阿里云Docker一键部署方案

## 部署架构

```
阿里云ECS服务器
├── Nginx (反向代理 + SSL)
├── Docker Compose
│   ├── Node.js 服务端容器
│   ├── MongoDB 容器
│   ├── Redis 容器
│   └── 静态文件服务容器 (Cocos Creator构建产物)
└── 域名 + SSL证书
```

## 1. 阿里云服务器准备

### 1.1 ECS实例配置推荐
- **CPU**: 2核心以上
- **内存**: 4GB以上
- **存储**: 40GB SSD以上
- **带宽**: 5Mbps以上
- **操作系统**: Ubuntu 20.04 LTS

### 1.2 安全组配置
```bash
# 开放端口
22    (SSH)
80    (HTTP)
443   (HTTPS)
3000  (Node.js服务，可选，用于调试)
```

## 2. Docker配置文件

### 2.1 项目根目录结构
```
ninghai_mj/
├── docker/
│   ├── Dockerfile.server      # 服务端镜像
│   ├── Dockerfile.client      # 客户端镜像
│   ├── docker-compose.yml     # 容器编排
│   ├── nginx.conf            # Nginx配置
│   └── .env.production       # 生产环境变量
├── server/                   # Node.js服务端代码
├── client/                   # Cocos Creator构建产物
├── deploy.sh                 # 一键部署脚本
└── README.md
```

### 2.2 服务端Dockerfile
```dockerfile
# docker/Dockerfile.server
FROM node:18-alpine

WORKDIR /app

# 复制package.json和package-lock.json
COPY server/package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY server/ ./

# 创建非root用户
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3001

CMD ["node", "src/app.js"]
```

### 2.3 客户端Dockerfile
```dockerfile
# docker/Dockerfile.client
FROM nginx:alpine

# 复制Cocos Creator构建的静态文件
COPY client/build/web-mobile/ /usr/share/nginx/html/

# 复制nginx配置
COPY docker/nginx-client.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

### 2.4 Docker Compose配置
```yaml
# docker/docker-compose.yml
version: '3.8'

services:
  # MongoDB数据库
  mongodb:
    image: mongo:5.0
    container_name: ninghai_mongodb
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USERNAME}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
      MONGO_INITDB_DATABASE: ${MONGO_DB_NAME}
    volumes:
      - mongodb_data:/data/db
      - ./mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro
    networks:
      - ninghai_network
    ports:
      - "27017:27017"

  # Redis缓存
  redis:
    image: redis:7-alpine
    container_name: ninghai_redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    networks:
      - ninghai_network
    ports:
      - "6379:6379"

  # Node.js服务端
  server:
    build:
      context: ..
      dockerfile: docker/Dockerfile.server
    container_name: ninghai_server
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3001
      MONGODB_URI: mongodb://${MONGO_ROOT_USERNAME}:${MONGO_ROOT_PASSWORD}@mongodb:27017/${MONGO_DB_NAME}
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      JWT_SECRET: ${JWT_SECRET}
      WECHAT_APP_ID: ${WECHAT_APP_ID}
      WECHAT_APP_SECRET: ${WECHAT_APP_SECRET}
    depends_on:
      - mongodb
      - redis
    networks:
      - ninghai_network
    ports:
      - "3001:3001"

  # 客户端静态文件服务
  client:
    build:
      context: ..
      dockerfile: docker/Dockerfile.client
    container_name: ninghai_client
    restart: unless-stopped
    networks:
      - ninghai_network
    ports:
      - "8080:80"

  # Nginx反向代理
  nginx:
    image: nginx:alpine
    container_name: ninghai_nginx
    restart: unless-stopped
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - nginx_logs:/var/log/nginx
    depends_on:
      - server
      - client
    networks:
      - ninghai_network
    ports:
      - "80:80"
      - "443:443"

volumes:
  mongodb_data:
  redis_data:
  nginx_logs:

networks:
  ninghai_network:
    driver: bridge
```

### 2.5 环境变量配置
```bash
# docker/.env.production
# 数据库配置
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=your_strong_password_here
MONGO_DB_NAME=ninghai_mahjong

# Redis配置
REDIS_PASSWORD=your_redis_password_here

# JWT配置
JWT_SECRET=your_jwt_secret_here

# 微信公众号配置
WECHAT_APP_ID=your_wechat_app_id
WECHAT_APP_SECRET=your_wechat_app_secret

# 域名配置
DOMAIN_NAME=yourdomain.com
```

### 2.6 Nginx配置
```nginx
# docker/nginx.conf
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    
    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log;
    
    # Gzip压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript 
               application/javascript application/xml+rss 
               application/json application/x-javascript;

    # 上游服务器
    upstream nodejs_backend {
        server server:3001;
    }

    upstream client_frontend {
        server client:80;
    }
    
    # HTTP重定向到HTTPS
    server {
        listen 80;
        server_name yourdomain.com www.yourdomain.com;
        return 301 https://$server_name$request_uri;
    }

    # HTTPS服务器
    server {
        listen 443 ssl http2;
        server_name yourdomain.com www.yourdomain.com;

        # SSL证书配置
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_session_timeout 1d;
        ssl_session_cache shared:SSL:50m;
        ssl_session_tickets off;
        
        # 现代SSL配置
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;

        # 安全头
        add_header Strict-Transport-Security "max-age=63072000" always;
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";

        # API代理
        location /api/ {
            proxy_pass http://nodejs_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Socket.io代理
        location /socket.io/ {
            proxy_pass http://nodejs_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        # 静态文件代理
        location / {
            proxy_pass http://client_frontend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # 缓存静态资源
            location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
                expires 1y;
                add_header Cache-Control "public, immutable";
            }
        }
        
        # 健康检查
        location /health {
            proxy_pass http://nodejs_backend;
            access_log off;
        }
    }
}
```

## 3. 一键部署脚本

### 3.1 部署脚本
```bash
#!/bin/bash
# deploy.sh

set -e

echo "🚀 开始部署宁海麻将到阿里云..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量
SERVER_HOST="your-server-ip"
SERVER_USER="root"
PROJECT_NAME="ninghai_mj"
REMOTE_PATH="/opt/${PROJECT_NAME}"

# 检查必要的工具
check_requirements() {
    echo "📋 检查部署环境..."
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker未安装${NC}"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}❌ Docker Compose未安装${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ 环境检查通过${NC}"
}

# 构建Cocos Creator项目
build_client() {
    echo "🔨 构建Cocos Creator项目..."
    
    # 这里需要根据实际情况调整构建命令
    # 可能需要在本地构建后上传，或者在服务器上构建
    if [ -d "client/build/web-mobile" ]; then
        echo -e "${GREEN}✅ 客户端构建产物已存在${NC}"
    else
        echo -e "${YELLOW}⚠️  请先构建Cocos Creator项目到 client/build/web-mobile${NC}"
        echo "构建步骤："
        echo "1. 打开Cocos Creator"
        echo "2. 选择项目 -> 构建发布"
        echo "3. 选择平台：Web Mobile"
        echo "4. 点击构建"
        exit 1
    fi
}

# 上传文件到服务器
upload_files() {
    echo "📤 上传文件到服务器..."
    
    # 创建远程目录
    ssh ${SERVER_USER}@${SERVER_HOST} "mkdir -p ${REMOTE_PATH}"
    
    # 上传项目文件
    rsync -avz --progress \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude '*.log' \
        ./ ${SERVER_USER}@${SERVER_HOST}:${REMOTE_PATH}/
    
    echo -e "${GREEN}✅ 文件上传完成${NC}"
}

# 在服务器上部署
deploy_on_server() {
    echo "🚀 在服务器上部署..."
    
    ssh ${SERVER_USER}@${SERVER_HOST} << EOF
        cd ${REMOTE_PATH}

    # 停止旧容器
        echo "停止旧容器..."
        docker-compose -f docker/docker-compose.yml down || true

    # 清理旧镜像
        echo "清理旧镜像..."
        docker system prune -f
        
        # 构建并启动新容器
        echo "构建并启动容器..."
        cd docker
        docker-compose --env-file .env.production up -d --build
        
        # 等待服务启动
        echo "等待服务启动..."
        sleep 30
        
        # 检查服务状态
        echo "检查服务状态..."
        docker-compose ps
        
        # 检查健康状态
        echo "检查应用健康状态..."
        curl -f http://localhost:3001/health || echo "健康检查失败"
        
        echo "部署完成！"
EOF
    
    echo -e "${GREEN}✅ 服务器部署完成${NC}"
}

# 配置SSL证书
setup_ssl() {
    echo "🔒 配置SSL证书..."
    
    ssh ${SERVER_USER}@${SERVER_HOST} << EOF
        cd ${REMOTE_PATH}
        
        # 创建SSL目录
        mkdir -p docker/ssl
        
        # 使用Let's Encrypt获取免费SSL证书
        if ! command -v certbot &> /dev/null; then
            echo "安装certbot..."
            apt update
            apt install -y certbot
        fi
        
        # 获取证书（需要先停止nginx）
        docker-compose -f docker/docker-compose.yml stop nginx
        
        certbot certonly --standalone \
            --email your-email@example.com \
            --agree-tos \
            --no-eff-email \
            -d yourdomain.com \
            -d www.yourdomain.com
        
        # 复制证书到docker目录
        cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem docker/ssl/cert.pem
        cp /etc/letsencrypt/live/yourdomain.com/privkey.pem docker/ssl/key.pem
        
        # 重启nginx
        docker-compose -f docker/docker-compose.yml up -d nginx
        
        echo "SSL证书配置完成"
EOF
}

# 主函数
main() {
    echo -e "${GREEN}🎮 宁海麻将一键部署脚本${NC}"
    echo "=================================="
    
    check_requirements
    build_client
    upload_files
    deploy_on_server
    
    echo ""
    echo -e "${GREEN}🎉 部署完成！${NC}"
    echo "访问地址: https://yourdomain.com"
    echo ""
    echo "常用命令："
    echo "查看日志: ssh ${SERVER_USER}@${SERVER_HOST} 'cd ${REMOTE_PATH}/docker && docker-compose logs -f'"
    echo "重启服务: ssh ${SERVER_USER}@${SERVER_HOST} 'cd ${REMOTE_PATH}/docker && docker-compose restart'"
    echo "停止服务: ssh ${SERVER_USER}@${SERVER_HOST} 'cd ${REMOTE_PATH}/docker && docker-compose down'"
}

# 执行主函数
main "$@"
```

### 3.2 服务器初始化脚本
```bash
#!/bin/bash
# server-init.sh - 在阿里云ECS上运行

echo "🔧 初始化阿里云ECS服务器..."

# 更新系统
apt update && apt upgrade -y

# 安装必要软件
apt install -y curl wget git vim htop

# 安装Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
systemctl start docker
systemctl enable docker

# 安装Docker Compose
curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# 创建项目目录
mkdir -p /opt/ninghai_mj

# 配置防火墙
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

echo "✅ 服务器初始化完成"
```

## 4. 使用说明

### 4.1 首次部署步骤

1. **准备阿里云ECS**
```bash
# 在ECS上运行初始化脚本
wget https://your-domain.com/server-init.sh
chmod +x server-init.sh
./server-init.sh
```

2. **配置环境变量**
```bash
# 编辑 docker/.env.production
# 填入真实的数据库密码、微信配置等
```

3. **构建Cocos Creator项目**
- 在Cocos Creator中构建Web Mobile版本
- 确保构建产物在 `client/build/web-mobile` 目录

4. **执行一键部署**
```bash
chmod +x deploy.sh
./deploy.sh
```

### 4.2 日常运维命令

```bash
# 查看服务状态
ssh root@your-server-ip 'cd /opt/ninghai_mj/docker && docker-compose ps'

# 查看日志
ssh root@your-server-ip 'cd /opt/ninghai_mj/docker && docker-compose logs -f server'

# 重启服务
ssh root@your-server-ip 'cd /opt/ninghai_mj/docker && docker-compose restart'

# 更新代码并重新部署
./deploy.sh
```

### 4.3 监控和备份

```bash
# 数据库备份脚本
#!/bin/bash
# backup.sh
docker exec ninghai_mongodb mongodump --out /backup/$(date +%Y%m%d_%H%M%S)
```

这个方案可以实现真正的一键部署到阿里云，包含了完整的Docker容器化、SSL证书、反向代理等配置。您只需要修改相关的域名和配置信息即可使用。