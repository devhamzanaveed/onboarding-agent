import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import type { EmployeeDetail } from '../api/client';
import { ProgressBar } from '../components/ProgressBar';

export function EmployeePage() {
  const { slackId } = useParams<{ slackId: string }>();
  const [data, setData] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slackId) return;
    api.getEmployee(slackId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [slackId]);

  if (loading) return <div className="loading">Loading...</div>;
  if (!data) return <div className="loading">Employee not found</div>;

  const totalTasks = data.days.reduce((sum, d) => sum + d.tasks.length, 0);
  const completedTasks = data.days.reduce(
    (sum, d) => sum + d.tasks.filter((t) => t.completed).length, 0,
  );
  const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const resourceIcons: Record<string, string> = {
    doc: '📄', link: '🔗', channel: '💬', tool: '🛠️', command: '⌨️',
  };

  return (
    <div>
      <Link to="/" className="back-link">← Back to Dashboard</Link>

      <div className="employee-header">
        <div>
          <h1>{data.user.name}</h1>
          <p className="role">{data.user.role}</p>
        </div>
        <div className="employee-stats">
          <span>Day {data.currentDay} of {data.totalDays}</span>
          <span>{completedTasks}/{totalTasks} tasks</span>
          {data.revisionCount > 0 && (
            <span className="badge">{data.revisionCount} replan(s)</span>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 400, margin: '16px 0' }}>
        <ProgressBar percent={percent} />
        <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>{percent}% complete</p>
      </div>

      <div className="timeline">
        {data.days.map((day) => {
          const dayComplete = day.tasks.length > 0 && day.tasks.every((t) => t.completed);
          const isCurrent = day.day === data.currentDay;

          return (
            <div key={day.day} className={`day-card ${isCurrent ? 'current' : ''} ${dayComplete ? 'complete' : ''}`}>
              <div className="day-header">
                <h3>Day {day.day}</h3>
                {dayComplete && <span className="check">✅</span>}
                {isCurrent && <span className="badge current-badge">Current</span>}
              </div>

              <div className="task-list">
                {day.tasks.map((task) => (
                  <div key={task.id} className={`task-item ${task.completed ? 'completed' : ''}`}>
                    <div className="task-check">{task.completed ? '✅' : '⬜'}</div>
                    <div className="task-content">
                      <div className="task-title">{task.title}</div>
                      <div className="task-desc">{task.description}</div>
                      {task.resources?.length > 0 && (
                        <div className="task-resources">
                          {task.resources.map((r, i) => (
                            <span key={i} className="resource-tag">
                              {resourceIcons[r.type] || '📌'} {r.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {day.tasks.length === 0 && (
                  <p className="no-tasks">No tasks for this day</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
