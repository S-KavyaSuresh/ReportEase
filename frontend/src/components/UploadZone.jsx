import React, { useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { getT } from '../utils/translations';
import { useApp } from '../context/AppContext';

export default function UploadZone({ files, onFiles, onRemove }) {
  const { language } = useApp();
  const t = getT(language);
  const inputRef = useRef(null);

  const onDrop = useCallback((accepted) => {
    if (accepted?.length) onFiles(accepted);
  }, [onFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [], 'application/pdf': [] },
    maxFiles: 10,
    maxSize: 20 * 1024 * 1024,
    noClick: true,
  });

  const handleBrowse = (e) => {
    e.stopPropagation();
    inputRef.current && inputRef.current.click();
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.length) {
            onFiles(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
      />

      <motion.div
        {...getRootProps()}
        animate={{
          borderColor: isDragActive ? 'rgba(129,140,248,0.8)' : 'rgba(148,163,254,0.2)',
          backgroundColor: isDragActive ? 'rgba(129,140,248,0.05)' : 'rgba(0,0,0,0)',
        }}
        transition={{ duration: 0.2 }}
        style={{
          border: '2px dashed rgba(148,163,254,0.2)',
          borderRadius: 16,
          padding: '38px 20px',
          textAlign: 'center',
          cursor: 'pointer',
        }}
        onClick={handleBrowse}
      >
        <input {...getInputProps()} style={{ display: 'none' }} />

        <motion.div animate={{ y: isDragActive ? -8 : 0 }} transition={{ type: 'spring', stiffness: 300 }} style={{ fontSize: '2.8rem', marginBottom: 12 }}>
          {isDragActive ? '📂' : '📄'}
        </motion.div>

        <div style={{ fontSize: '0.95rem', color: 'var(--text2)', marginBottom: 6 }}>
          {isDragActive ? 'Drop files here' : t.dragText}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 16 }}>
          {t.dragSub}
        </div>

        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={handleBrowse}
          style={{
            padding: '9px 22px',
            background: 'var(--surface2)',
            border: '1px solid var(--border2)',
            borderRadius: 22,
            color: 'var(--primary)',
            fontSize: '0.84rem',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
          }}
        >
          {t.browse}
        </motion.button>
      </motion.div>

      <AnimatePresence>
        {!!files?.length && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display:'grid', gap:10, marginTop:12 }}>
            {files.map((file, index) => (
              <motion.div key={`${file.name}-${index}`}
                initial={{ opacity: 0, y: -10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.96 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border2)',
                  borderRadius: 12,
                }}
              >
                <div style={{
                  width: 46, height: 46, borderRadius: 8,
                  background: 'rgba(129,140,248,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.4rem', flexShrink: 0,
                }}>
                  {file.type.startsWith('image/') ? '🖼️' : '📄'}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>
                    {(file.size / 1024).toFixed(0)} KB
                  </div>
                </div>
                <motion.button whileHover={{ scale: 1.15 }} onClick={() => onRemove(index)}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '1.1rem', padding: 4 }}
                >
                  ✕
                </motion.button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
