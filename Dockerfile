# Стабильный образ Node.js на базе Alpine Linux
FROM node:20-alpine

# Рабочая папка внутри контейнера
WORKDIR /app

# Копируем конфигурацию зависимостей
COPY package*.json ./

# Устанавливаем только необходимые зависимости для продакшена (без dev-пакетов)
RUN npm install --omit=dev

# Копируем bot.js и остальные файлы проекта
COPY . .

# Запуск скрипта через команду из package.json
CMD ["npm", "start"]