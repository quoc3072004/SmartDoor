from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from datetime import datetime
from database import SessionLocal
from models import AccessLog

router = APIRouter()

api_logs = []


def log_api(method, path, status_code):
    api_logs.append({
        "method": method,
        "path": path,
        "status_code": status_code,
        "time": datetime.now().strftime("%H:%M:%S")
    })

    if len(api_logs) > 200:
        api_logs.pop(0)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/dashboard/stats")
def dashboard_stats(db: Session = Depends(get_db)):
    total_requests = len(api_logs)
    get_count = len([x for x in api_logs if x["method"] == "GET"])
    post_count = len([x for x in api_logs if x["method"] == "POST"])
    error_count = len([x for x in api_logs if x["status_code"] >= 400])

    face_success = db.query(AccessLog).filter(
        AccessLog.method == "FACE",
        AccessLog.result == "SUCCESS"
    ).count()

    face_fail = db.query(AccessLog).filter(
        AccessLog.method == "FACE",
        AccessLog.result == "FAIL"
    ).count()

    qr_success = db.query(AccessLog).filter(
        AccessLog.method == "QR",
        AccessLog.result == "SUCCESS"
    ).count()

    qr_fail = db.query(AccessLog).filter(
        AccessLog.method == "QR",
        AccessLog.result == "FAIL"
    ).count()

    api_count = {}

    for log in api_logs:
        path = log["path"]
        api_count[path] = api_count.get(path, 0) + 1

    recent_access = db.query(AccessLog).order_by(
        AccessLog.id.desc()
    ).limit(10).all()

    return {
        "total_requests": total_requests,
        "get_count": get_count,
        "post_count": post_count,
        "error_count": error_count,
        "face_success": face_success,
        "face_fail": face_fail,
        "qr_success": qr_success,
        "qr_fail": qr_fail,
        "api_count": api_count,
        "api_logs": api_logs[-20:],
        "recent_access": [
            {
                "method": x.method,
                "result": x.result,
                "message": x.message,
                "created_at": x.created_at.strftime("%Y-%m-%d %H:%M:%S")
            }
            for x in recent_access
        ]
    }


@router.get("/dashboard", response_class=HTMLResponse)
def dashboard_page():
    return """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Smart Door Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            margin: 0;
            font-family: Arial;
            background: #f4f6f8;
            color: #222;
        }

        header {
            background: #0f766e;
            color: white;
            padding: 20px;
            font-size: 24px;
            font-weight: bold;
        }

        .container {
            padding: 20px;
        }

        .cards {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin-bottom: 20px;
        }

        .card {
            background: white;
            padding: 18px;
            border-radius: 12px;
            box-shadow: 0 2px 8px #0001;
        }

        .card h3 {
            margin: 0;
            font-size: 14px;
            color: #666;
        }

        .card p {
            font-size: 30px;
            font-weight: bold;
            margin: 8px 0 0;
        }

        .charts {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }

        .panel {
            background: white;
            padding: 18px;
            border-radius: 12px;
            box-shadow: 0 2px 8px #0001;
            margin-bottom: 20px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }

        th, td {
            padding: 10px;
            border-bottom: 1px solid #ddd;
        }

        th {
            background: #f1f5f9;
            text-align: left;
        }

        .success {
            color: green;
            font-weight: bold;
        }

        .fail {
            color: red;
            font-weight: bold;
        }

        .alert {
            background: #fee2e2;
            color: #991b1b;
            padding: 14px;
            border-radius: 10px;
            margin-bottom: 15px;
            display: none;
            font-weight: bold;
        }
    </style>
</head>

<body>
    <header>Smart Door Server Dashboard</header>

    <div class="container">

        <div id="alertBox" class="alert">
            Cảnh báo: Có nhiều lần xác thực thất bại!
        </div>

        <div class="cards">
            <div class="card">
                <h3>Tổng request</h3>
                <p id="totalRequests">0</p>
            </div>

            <div class="card">
                <h3>GET</h3>
                <p id="getCount">0</p>
            </div>

            <div class="card">
                <h3>POST</h3>
                <p id="postCount">0</p>
            </div>

            <div class="card">
                <h3>Lỗi API</h3>
                <p id="errorCount">0</p>
            </div>
        </div>

        <div class="cards">
            <div class="card">
                <h3>Face Success</h3>
                <p id="faceSuccess">0</p>
            </div>

            <div class="card">
                <h3>Face Fail</h3>
                <p id="faceFail">0</p>
            </div>

            <div class="card">
                <h3>QR Success</h3>
                <p id="qrSuccess">0</p>
            </div>

            <div class="card">
                <h3>QR Fail</h3>
                <p id="qrFail">0</p>
            </div>
        </div>

        <div class="charts">
            <div class="panel">
                <h3>Biểu đồ số request theo API</h3>
                <canvas id="apiChart"></canvas>
            </div>

            <div class="panel">
                <h3>Biểu đồ GET / POST</h3>
                <canvas id="methodChart"></canvas>
            </div>
        </div>

        <div class="panel">
            <h3>Lịch sử truy cập cửa</h3>
            <table>
                <thead>
                    <tr>
                        <th>Thời gian</th>
                        <th>Phương thức</th>
                        <th>Kết quả</th>
                        <th>Nội dung</th>
                    </tr>
                </thead>
                <tbody id="accessTable"></tbody>
            </table>
        </div>

        <div class="panel">
            <h3>API request gần đây</h3>
            <table>
                <thead>
                    <tr>
                        <th>Thời gian</th>
                        <th>Method</th>
                        <th>Path</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="apiTable"></tbody>
            </table>
        </div>

    </div>

<script>
let apiChart;
let methodChart;

async function loadDashboard() {
    const res = await fetch('/dashboard/stats');
    const data = await res.json();

    document.getElementById('totalRequests').innerText = data.total_requests;
    document.getElementById('getCount').innerText = data.get_count;
    document.getElementById('postCount').innerText = data.post_count;
    document.getElementById('errorCount').innerText = data.error_count;

    document.getElementById('faceSuccess').innerText = data.face_success;
    document.getElementById('faceFail').innerText = data.face_fail;
    document.getElementById('qrSuccess').innerText = data.qr_success;
    document.getElementById('qrFail').innerText = data.qr_fail;

    if (data.face_fail >= 3 || data.qr_fail >= 3 || data.error_count >= 5) {
        document.getElementById('alertBox').style.display = 'block';
    } else {
        document.getElementById('alertBox').style.display = 'none';
    }

    const apiLabels = Object.keys(data.api_count);
    const apiValues = Object.values(data.api_count);

    if (apiChart) apiChart.destroy();

    apiChart = new Chart(document.getElementById('apiChart'), {
        type: 'bar',
        data: {
            labels: apiLabels,
            datasets: [{
                label: 'Request',
                data: apiValues
            }]
        }
    });

    if (methodChart) methodChart.destroy();

    methodChart = new Chart(document.getElementById('methodChart'), {
        type: 'doughnut',
        data: {
            labels: ['GET', 'POST'],
            datasets: [{
                data: [data.get_count, data.post_count]
            }]
        }
    });

    let accessHtml = '';

    data.recent_access.forEach(item => {
        accessHtml += `
            <tr>
                <td>${item.created_at}</td>
                <td>${item.method}</td>
                <td class="${item.result === 'SUCCESS' ? 'success' : 'fail'}">${item.result}</td>
                <td>${item.message}</td>
            </tr>
        `;
    });

    document.getElementById('accessTable').innerHTML = accessHtml;

    let apiHtml = '';

    data.api_logs.reverse().forEach(item => {
        apiHtml += `
            <tr>
                <td>${item.time}</td>
                <td>${item.method}</td>
                <td>${item.path}</td>
                <td>${item.status_code}</td>
            </tr>
        `;
    });

    document.getElementById('apiTable').innerHTML = apiHtml;
}

loadDashboard();
setInterval(loadDashboard, 3000);
</script>

</body>
</html>
"""