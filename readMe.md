#Instructions

These instructions assume that the user has Node.js and PostgreSQL
already installed.

###In main directory
Install dependencies

```npm install```

Create database

```psql -f data.sql```

Use models to seed it from API

```node seed.js```

To run tests

```npm test```
