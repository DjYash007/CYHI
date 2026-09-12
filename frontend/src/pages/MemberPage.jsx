import React, { useState } from 'react';
import { useParams } from 'react-router-dom';

// Mock Invitation Data based on prompt
const mockInvitation = {
  formId: "mock-form-id",
  memberId: "mock-member-id",
  token: "mock-token-123",
  fields: [
    {
      fieldId: "f1",
      label: "Full Name",
      type: "text",
      required: true
    },
    {
      fieldId: "f2",
      label: "Email",
      type: "email",
      required: true
    },
    {
      fieldId: "f3",
      label: "GitHub Profile",
      type: "url",
      required: false
    },
    {
      fieldId: "f4",
      label: "College Name",
      type: "text",
      required: true
    },
    {
      fieldId: "f5",
      label: "Short Bio",
      type: "textarea",
      required: false
    }
  ]
};

export default function MemberPage() {
  const { token } = useParams();
  
  // In a real app, we would fetch the invitation details based on `token`
  // using something like: fetch(`/api/join/${token}`)
  const invitation = mockInvitation;
  
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (fieldId, value) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value
    }));
    // Clear error for this field
    if (errors[fieldId]) {
      setErrors(prev => ({ ...prev, [fieldId]: null }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setStatus({ type: '', message: '' });
    
    // Validate
    const newErrors = {};
    let hasErrors = false;
    
    invitation.fields.forEach(field => {
      const val = formData[field.fieldId];
      if (field.required && (!val || val.trim() === '')) {
        newErrors[field.fieldId] = 'This field is required';
        hasErrors = true;
      }
    });

    if (hasErrors) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    
    // Build the response object required by the backend
    const responses = invitation.fields.map(field => ({
      fieldId: field.fieldId,
      value: formData[field.fieldId] || ""
    }));

    const responsePayload = {
      formId: invitation.formId,
      memberId: invitation.memberId,
      responses: responses
    };

    console.log("Submitted Response Payload:", JSON.stringify(responsePayload, null, 2));

    // Simulate backend call
    setTimeout(() => {
      setIsSubmitting(false);
      setStatus({ type: 'success', message: 'Your information has been submitted successfully.' });
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-indigo-600 tracking-tight">COLLAB FORM</h1>
          <h2 className="mt-2 text-xl font-medium text-gray-900">Kindly fill the form</h2>
          <p className="mt-1 text-sm text-gray-500">Please provide the information assigned to you.</p>
        </div>

        <div className="bg-white shadow sm:rounded-lg border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {invitation.fields.map((field) => (
                <div key={field.fieldId}>
                  <label htmlFor={field.fieldId} className="block text-sm font-medium text-gray-700">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </label>
                  <div className="mt-1">
                    {field.type === 'textarea' ? (
                      <textarea
                        id={field.fieldId}
                        rows={4}
                        className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border ${errors[field.fieldId] ? 'border-red-300' : ''}`}
                        placeholder={field.placeholder || ""}
                        value={formData[field.fieldId] || ""}
                        onChange={(e) => handleInputChange(field.fieldId, e.target.value)}
                      />
                    ) : (
                      <input
                        type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
                        id={field.fieldId}
                        className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border ${errors[field.fieldId] ? 'border-red-300' : ''}`}
                        placeholder={field.placeholder || ""}
                        value={formData[field.fieldId] || ""}
                        onChange={(e) => handleInputChange(field.fieldId, e.target.value)}
                      />
                    )}
                  </div>
                  {errors[field.fieldId] && (
                    <p className="mt-1 text-sm text-red-600">{errors[field.fieldId]}</p>
                  )}
                </div>
              ))}

              {status.message && (
                <div className={`rounded-md p-4 ${status.type === 'success' ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="flex">
                    <div className="ml-3">
                      <p className={`text-sm font-medium ${status.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
                        {status.message}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={isSubmitting || status.type === 'success'}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
