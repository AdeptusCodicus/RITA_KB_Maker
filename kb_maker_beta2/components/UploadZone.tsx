'use client';
import React, { useRef, useState, useCallback } from 'react';
import { Upload, FileText, Image as ImageIcon, X } from 'lucide-react';
import { UploadedFile } from '../types/kb';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  selectedFile: UploadedFile | null;
  disabled?: boolean;
}

export default function UploadZone({ onFileSelect, selectedFile, disabled = false }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      validateAndSelect(file);
    }
  }, [disabled]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      validateAndSelect(file);
    }
  }, []);

  const validateAndSelect = (file: File) => {
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/tiff'];
    if (validTypes.includes(file.type) || file.name.match(/\.(pdf|png|jpg|jpeg|webp|tiff)$/i)) {
      onFileSelect(file);
    } else {
      alert('Invalid file type');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const isImage = selectedFile?.type.startsWith('image/');

  return (
    <div 
      className={`relative w-full max-w-2xl mx-auto border-2 border-dashed rounded-xl p-8 transition-colors duration-200 
        ${isDragging ? 'border-blue-600 bg-blue-50 animate-pulse' : 'border-slate-300 bg-white hover:border-slate-400'} 
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && fileInputRef.current?.click()}
    >
      <input 
        type="file" 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleFileInput}
        accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff"
        disabled={disabled}
      />
      
      {!selectedFile ? (
        <div className="flex flex-col items-center justify-center text-slate-500">
          <Upload className="w-12 h-12 mb-4 text-slate-400" />
          <p className="text-lg font-medium text-slate-700">Click or drag file to this area to upload</p>
          <p className="text-sm mt-2">Support for a single PDF or Image file (.pdf, .png, .jpg, .webp, .tiff)</p>
        </div>
      ) : (
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center space-x-4">
            {isImage ? <ImageIcon className="w-10 h-10 text-blue-600" /> : <FileText className="w-10 h-10 text-blue-600" />}
            <div>
              <p className="font-medium text-slate-800 truncate max-w-xs">{selectedFile.name}</p>
              <p className="text-sm text-slate-500">{formatSize(selectedFile.size)}</p>
            </div>
          </div>
          <button 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
            onClick={(e) => { e.stopPropagation(); onFileSelect(null as unknown as File); }}
            title="Remove file"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
