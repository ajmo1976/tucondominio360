#!/bin/bash
kill -9 $(lsof -t -i :3000) 2>/dev/null || true
kill -9 $(lsof -t -i :3001) 2>/dev/null || true
echo "Servicios Web (3000) y API (3001) detenidos."
