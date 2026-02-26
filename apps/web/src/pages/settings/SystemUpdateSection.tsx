import { useState, useEffect, useRef, useCallback } from 'react';
import {
  RefreshCw,
  Download,
  ArrowDownCircle,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RotateCcw,
  HardDrive,
  GitBranch,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { systemService } from '../../services/system.service';
import type {
  VersionInfo,
  UpdateCheckResult,
  UpdateStatus,
  BackupInfo,
} from '../../services/system.service';

const UPDATE_STEPS = [
  'Pre-flight checks',
  'Backing up database',
  'Saving rollback point',
  'Pulling latest code',
  'Building containers',
  'Updating database schema',
  'Restarting services',
  'Health check',
  'Update complete',
];

function formatDate(dateStr: string) {
  if (!dateStr || dateStr === 'unknown') return '-';
  try {
    return new Date(dateStr).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatTimestamp(ts: number) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SystemUpdateSection() {
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);

  const [loadingVersion, setLoadingVersion] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [loadingBackups, setLoadingBackups] = useState(false);

  const [showChangelog, setShowChangelog] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showBackups, setShowBackups] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  // Fetch version on mount
  useEffect(() => {
    fetchVersion();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const fetchVersion = async () => {
    setLoadingVersion(true);
    try {
      const res = await systemService.getVersion();
      if (res.success && res.data) setVersion(res.data);
    } catch (e) {
      console.error('Failed to fetch version:', e);
    } finally {
      setLoadingVersion(false);
    }
  };

  const handleCheckUpdate = async () => {
    setChecking(true);
    setError(null);
    setUpdateCheck(null);
    try {
      const res = await systemService.checkForUpdate();
      if (res.success && res.data) {
        setUpdateCheck(res.data);
      } else {
        setError(res.error || 'Failed to check for updates');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to check for updates');
    } finally {
      setChecking(false);
    }
  };

  const startPolling = useCallback(() => {
    const MAX_POLL_DURATION = 10 * 60 * 1000; // 10 minutes
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollStartRef.current = Date.now();
    pollingRef.current = setInterval(async () => {
      // Timeout protection — stop polling after 10 minutes
      if (Date.now() - pollStartRef.current > MAX_POLL_DURATION) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        setUpdating(false);
        setRollingBack(false);
        setError('Update status polling timed out after 10 minutes. Check server logs.');
        return;
      }
      try {
        const res = await systemService.getUpdateStatus();
        if (res.success && res.data) {
          setUpdateStatus(res.data);
          // Stop polling when done
          if (
            res.data.status === 'success' ||
            res.data.status === 'error' ||
            res.data.status === 'rollback_complete' ||
            res.data.status === 'warning' ||
            res.data.status === 'idle'
          ) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            setUpdating(false);
            setRollingBack(false);
            // Refresh version after update
            if (res.data.status === 'success' || res.data.status === 'rollback_complete') {
              fetchVersion();
            }
          }
        }
      } catch {
        // Keep polling even on error
      }
    }, 2000);
  }, []);

  const handleTriggerUpdate = async () => {
    setConfirmUpdate(false);
    setUpdating(true);
    setError(null);
    setUpdateStatus(null);
    try {
      const res = await systemService.triggerUpdate();
      if (res.success) {
        startPolling();
      } else {
        setError(res.error || 'Failed to start update');
        setUpdating(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start update');
      setUpdating(false);
    }
  };

  const handleRollback = async () => {
    setConfirmRollback(false);
    setRollingBack(true);
    setError(null);
    setUpdateStatus(null);
    try {
      const res = await systemService.triggerRollback();
      if (res.success) {
        startPolling();
      } else {
        setError(res.error || 'Failed to start rollback');
        setRollingBack(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start rollback');
      setRollingBack(false);
    }
  };

  const handleLoadBackups = async () => {
    setShowBackups(!showBackups);
    if (!showBackups) {
      setLoadingBackups(true);
      try {
        const res = await systemService.listBackups();
        if (res.success && res.data) {
          setBackups(res.data.backups || []);
        }
      } catch {
        // ignore
      } finally {
        setLoadingBackups(false);
      }
    }
  };

  const isProcessing = updating || rollingBack;
  const displayVersion = version?.tag || (version?.version ? `v${version.version}` : version?.commit || '-');

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6 lg:p-8 space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 border-b pb-2 flex items-center gap-2">
        <ArrowDownCircle className="w-5 h-5" />
        อัพเดทระบบ (System Update)
      </h2>

      {/* Current Version */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">เวอร์ชันปัจจุบัน (Current Version)</p>
            <div className="flex items-center gap-3 mt-1">
              {loadingVersion ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              ) : (
                <>
                  <span className="text-lg font-mono font-semibold text-gray-900">
                    {displayVersion}
                  </span>
                  {version?.commit && (
                    <span className="text-sm text-gray-500 font-mono">
                      ({version.commit})
                    </span>
                  )}
                  {version?.date && (
                    <span className="text-sm text-gray-400">
                      {formatDate(version.date)}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          <button
            onClick={handleCheckUpdate}
            disabled={checking || isProcessing}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all"
          >
            {checking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {checking ? 'กำลังตรวจสอบ...' : 'ตรวจสอบอัพเดท'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-red-800">เกิดข้อผิดพลาด</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Update Available */}
      {updateCheck && !isProcessing && (
        <div
          className={`rounded-lg p-4 border ${
            updateCheck.hasUpdate
              ? 'bg-amber-50 border-amber-200'
              : 'bg-green-50 border-green-200'
          }`}
        >
          {updateCheck.hasUpdate ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Download className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-amber-800">
                    มีอัพเดทใหม่! (Update Available)
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">เวอร์ชันใหม่:</span>
                      <span className="ml-2 font-mono font-semibold text-gray-900">
                        {updateCheck.latestTag || updateCheck.latestCommit}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">วันที่:</span>
                      <span className="ml-2 text-gray-700">
                        {formatDate(updateCheck.latestDate)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Branch:</span>
                      <span className="ml-2 font-mono text-gray-700">
                        <GitBranch className="w-3 h-3 inline mr-1" />
                        {updateCheck.branch}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">จำนวน commits:</span>
                      <span className="ml-2 font-semibold text-gray-700">
                        {updateCheck.commitCount}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Changelog */}
              {updateCheck.changelog.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowChangelog(!showChangelog)}
                    className="flex items-center gap-1 text-sm text-amber-700 hover:text-amber-900 font-medium"
                  >
                    {showChangelog ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {showChangelog ? 'ซ่อน' : 'ดู'} รายละเอียดการเปลี่ยนแปลง ({updateCheck.changelog.length})
                  </button>
                  {showChangelog && (
                    <div className="mt-2 max-h-48 overflow-y-auto bg-white rounded border border-amber-200 p-3">
                      {updateCheck.changelog.map((entry, i) => (
                        <div key={i} className="flex gap-3 py-1.5 border-b border-gray-100 last:border-0 text-sm">
                          <span className="font-mono text-gray-400 flex-shrink-0">{entry.hash}</span>
                          <span className="text-gray-700 flex-1">{entry.message}</span>
                          <span className="text-gray-400 flex-shrink-0 text-xs">{entry.author}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Update Button */}
              <div className="flex items-center gap-3">
                {!confirmUpdate ? (
                  <button
                    onClick={() => setConfirmUpdate(true)}
                    className="flex items-center gap-2 bg-amber-600 text-white px-5 py-2.5 rounded-lg hover:bg-amber-700 font-medium transition-all"
                  >
                    <Download className="w-4 h-4" />
                    อัพเดทตอนนี้
                  </button>
                ) : (
                  <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <span className="text-sm text-red-700">
                      ระบบจะหยุดทำงานชั่วคราว ~1 นาที ยืนยันอัพเดท?
                    </span>
                    <button
                      onClick={handleTriggerUpdate}
                      className="bg-red-600 text-white px-4 py-1.5 rounded-lg hover:bg-red-700 text-sm font-medium"
                    >
                      ยืนยัน
                    </button>
                    <button
                      onClick={() => setConfirmUpdate(false)}
                      className="bg-gray-200 text-gray-700 px-4 py-1.5 rounded-lg hover:bg-gray-300 text-sm font-medium"
                    >
                      ยกเลิก
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <p className="font-medium text-green-800">ระบบเป็นเวอร์ชันล่าสุดแล้ว (Up to date)</p>
            </div>
          )}
        </div>
      )}

      {/* Update Progress */}
      {(isProcessing || (updateStatus && updateStatus.status !== 'idle')) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-2">
            {updateStatus?.status === 'running' || updateStatus?.status === 'rolling_back' ? (
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            ) : updateStatus?.status === 'success' || updateStatus?.status === 'rollback_complete' ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : updateStatus?.status === 'error' ? (
              <XCircle className="w-5 h-5 text-red-600" />
            ) : updateStatus?.status === 'warning' ? (
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            ) : null}
            <p className="font-medium text-gray-900">
              {updateStatus?.status === 'rolling_back'
                ? 'กำลัง Rollback...'
                : updateStatus?.status === 'rollback_complete'
                ? 'Rollback สำเร็จ'
                : updateStatus?.status === 'success'
                ? 'อัพเดทสำเร็จ!'
                : updateStatus?.status === 'error'
                ? 'อัพเดทล้มเหลว'
                : 'กำลังอัพเดท...'}
            </p>
          </div>

          {/* Step Progress */}
          {updateStatus && updateStatus.totalSteps > 0 && (
            <div className="space-y-2">
              {UPDATE_STEPS.map((stepName, i) => {
                const stepNum = i + 1;
                const isCurrent = stepNum === updateStatus.step;
                const isDone = stepNum < updateStatus.step;
                const isFailed = isCurrent && updateStatus.status === 'error';
                return (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                      {isDone ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : isFailed ? (
                        <XCircle className="w-5 h-5 text-red-500" />
                      ) : isCurrent ? (
                        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                      )}
                    </div>
                    <span
                      className={`${
                        isDone
                          ? 'text-green-700'
                          : isCurrent
                          ? 'text-blue-700 font-medium'
                          : isFailed
                          ? 'text-red-700 font-medium'
                          : 'text-gray-400'
                      }`}
                    >
                      {stepName}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Status Message */}
          {updateStatus?.message && (
            <p className="text-sm text-gray-600 bg-white rounded p-2 border border-gray-200">
              {updateStatus.message}
            </p>
          )}

          {/* Logs Toggle */}
          {updateStatus?.logs && updateStatus.logs.length > 0 && (
            <div>
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showLogs ? 'ซ่อน' : 'ดู'} Logs ({updateStatus.logs.length} บรรทัด)
              </button>
              {showLogs && (
                <pre className="mt-2 max-h-48 overflow-y-auto bg-gray-900 text-green-400 text-xs rounded p-3 font-mono">
                  {updateStatus.logs.join('\n')}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions Row */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        {/* Rollback Button */}
        {!confirmRollback ? (
          <button
            onClick={() => setConfirmRollback(true)}
            disabled={isProcessing}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all border border-gray-300"
          >
            <RotateCcw className="w-4 h-4" />
            Rollback
          </button>
        ) : (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-2">
            <span className="text-sm text-red-700">ย้อนกลับเวอร์ชันก่อนหน้า?</span>
            <button
              onClick={handleRollback}
              className="bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 text-sm font-medium"
            >
              ยืนยัน
            </button>
            <button
              onClick={() => setConfirmRollback(false)}
              className="bg-gray-200 text-gray-700 px-3 py-1 rounded-lg hover:bg-gray-300 text-sm font-medium"
            >
              ยกเลิก
            </button>
          </div>
        )}

        {/* Backups Toggle */}
        <button
          onClick={handleLoadBackups}
          disabled={isProcessing}
          className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all border border-gray-300"
        >
          <HardDrive className="w-4 h-4" />
          {showBackups ? 'ซ่อน Backups' : 'ดู Backups'}
        </button>
      </div>

      {/* Backups List */}
      {showBackups && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            Database Backups (เก็บล่าสุด 5 รายการ)
          </h3>
          {loadingBackups ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              กำลังโหลด...
            </div>
          ) : backups.length === 0 ? (
            <p className="text-sm text-gray-500">ไม่มี Backup</p>
          ) : (
            <div className="space-y-2">
              {backups.map((backup, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-2"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-mono text-gray-700">{backup.filename}</p>
                      <p className="text-xs text-gray-400">
                        {formatTimestamp(backup.timestamp)} &middot; {backup.size}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">
            Backup อัตโนมัติทุกวัน 17:00 น. + ก่อนอัพเดททุกครั้ง
          </p>
        </div>
      )}
    </section>
  );
}
