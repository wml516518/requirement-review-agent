import json
import io
import unittest
from email.message import Message

from server import ReviewHandler


class ServerCorsTest(unittest.TestCase):
    def make_handler(self, method="GET", path="/missing", body=b""):
        handler = ReviewHandler.__new__(ReviewHandler)
        handler.request_version = "HTTP/1.1"
        handler.command = method
        handler.path = path
        handler.requestline = f"{method} {path} HTTP/1.1"
        handler.client_address = ("127.0.0.1", 12345)
        handler.server = object()
        handler.close_connection = False
        handler.rfile = io.BytesIO(body)
        handler.wfile = io.BytesIO()
        handler.headers = Message()
        if body:
            handler.headers["Content-Length"] = str(len(body))
        return handler

    def response_text(self, handler):
        return handler.wfile.getvalue().decode("iso-8859-1")

    def test_error_responses_include_cors_headers(self):
        handler = self.make_handler()

        handler.send_error(404)

        response = self.response_text(handler)
        self.assertIn(" 404 ", response)
        self.assertIn("Access-Control-Allow-Origin: *", response)

    def test_api_ask_is_json_endpoint_with_cors(self):
        handler = self.make_handler("POST", "/api/ask", json.dumps({}).encode("utf-8"))

        handler.do_POST()

        response = handler.wfile.getvalue()
        headers, raw_body = response.split(b"\r\n\r\n", 1)
        body = json.loads(raw_body.decode("utf-8"))
        self.assertIn(b"Access-Control-Allow-Origin: *", headers)
        self.assertIn(b"Content-Type: application/json", headers)
        self.assertFalse(body["ok"])


if __name__ == "__main__":
    unittest.main()
