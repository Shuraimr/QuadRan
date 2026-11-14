import mysql from "mysql2/promise";

export const pool = mysql.createPool({
  host: "localhost",
  port: 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: "quadran",
  charset: "utf8mb4",
});
