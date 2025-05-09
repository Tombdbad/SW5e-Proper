
import { FC, useState } from 'react';

interface SaveControlsProps {
  onSave: () => Promise<void>;
  isDirty: boolean;
}

const SaveControls: FC<SaveControlsProps> = ({ onSave, isDirty }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  
  const handleSave = async () => {
    if (!isDirty) {
      setSaveMessage({
        text: 'No changes to save',
        type: 'info'
      });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }
    
    setIsSaving(true);
    setSaveMessage(null);
    
    try {
      await onSave();
      
      setSaveMessage({
        text: 'Character saved successfully!',
        type: 'success'
      });
      
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      setSaveMessage({
        text: 'Failed to save character',
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <div className="save-controls inline-block">
      {saveMessage && (
        <span className={`text-sm mr-3 ${
          saveMessage.type === 'success' ? 'text-green-500' :
          saveMessage.type === 'error' ? 'text-red-500' :
          'text-blue-500'
        }`}>
          {saveMessage.text}
        </span>
      )}
      
      <button
        type="button"
        className={`px-4 py-2 rounded-md ${
          isDirty 
            ? 'bg-green-600 hover:bg-green-700 text-white' 
            : 'bg-gray-700 text-gray-400'
        }`}
        onClick={handleSave}
        disabled={isSaving}
      >
        {isSaving ? (
          <span className="flex items-center">
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Saving...
          </span>
        ) : (
          'Save'
        )}
      </button>
      
      {isDirty && !saveMessage && (
        <div className="text-xs text-amber-500 mt-1">
          Unsaved changes
        </div>
      )}
    </div>
  );
};

export default SaveControls;
