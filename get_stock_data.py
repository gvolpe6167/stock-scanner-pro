# get_stock_data.py - Script para obtener datos precisos de Yahoo Finance
import yfinance as yf
import sys
import json

def get_stock_data(ticker):
    try:
        stock = yf.Ticker(ticker)
        
        # Obtener datos históricos de 1 año
        hist = stock.history(period="1y", interval="1d")
        
        if hist.empty or len(hist) < 50:
            return {"error": "Datos insuficientes"}
        
        # Obtener precios de cierre
        closes = hist['Close'].dropna().tolist()
        
        if len(closes) < 50:
            return {"error": "Datos insuficientes"}
        
        # Precio actual y anterior
        current_price = closes[-1]
        previous_price = closes[-2] if len(closes) > 1 else current_price
        
        return {
            "success": True,
            "ticker": ticker,
            "currentPrice": current_price,
            "previousPrice": previous_price,
            "closes": closes
        }
        
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No ticker provided"}))
        sys.exit(1)
    
    ticker = sys.argv[1]
    result = get_stock_data(ticker)
    print(json.dumps(result))