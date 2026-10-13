# AWS Serverless Ticketing System

A help-desk ticketing application built with **Vue 3, Vite, Tailwind CSS, AWS Cognito, API Gateway, Lambda, DynamoDB, and S3**.

**Live Demo:** [Open the Ticketing System](https://main.d3sty381dw5n6w.amplifyapp.com/)

## Features

- Customer and Agent authentication
- Create, view, and manage support tickets
- Ticket status, priority, category, and search filters
- Comments and activity history
- Private attachments using pre-signed S3 URLs
- Role-based access control

## Tech Stack

- **Frontend:** Vue 3, Vite, Tailwind CSS
- **Authentication:** Amazon Cognito
- **Backend:** Node.js 22, AWS Lambda, API Gateway
- **Database:** Amazon DynamoDB
- **Storage:** Amazon S3

## Run Locally

**1. Start the backend**

```powershell
cd backend
npm install
npm start
```

**2. Start the frontend** in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Local development uses mock authentication and JSON-file storage. Use the provided test users in `backend/src/lib/mockUsers.js`.

## Testing

```powershell
# Backend tests
cd backend
npm test

# Frontend tests
cd ..\frontend
npm test
```

## Deployment Status

The application supports local development and includes AWS integration code.

## Security

Never commit credentials, access tokens, or populated `.env` files. Use `.env.example` as the configuration template.
