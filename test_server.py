from http.server import HTTPServer, BaseHTTPRequestHandler
import json

class SimpleHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        
        if self.path == '/':
            response = {"message": "Simple server is running"}
        elif self.path == '/api/test':
            response = {"message": "API is working", "status": "ok"}
        else:
            response = {"error": "Not found"}
        
        self.wfile.write(json.dumps(response).encode())
    
    def do_POST(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        
        if self.path == '/api/upload':
            response = {
                "message": "File upload endpoint working",
                "test": True,
                "file_url": "/uploads/test.txt",
                "file_size": 1024
            }
        else:
            response = {"error": "Not found"}
        
        self.wfile.write(json.dumps(response).encode())

if __name__ == '__main__':
    port = 8000
    server = HTTPServer(('0.0.0.0', port), SimpleHandler)
    print(f"Server running on port {port}")
    server.serve_forever()
