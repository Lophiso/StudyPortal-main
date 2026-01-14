export type Database = {
  public: {
    Tables: {
      programs: {
        Row: {
          id: number;
          title: string;
          university: string;
          country: string;
          tuition_fee: number;
          currency: string;
          duration_months: number;
          study_level: string;
          description: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          title: string;
          university: string;
          country: string;
          tuition_fee: number;
          currency?: string;
          duration_months: number;
          study_level: string;
          description: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          title?: string;
          university?: string;
          country?: string;
          tuition_fee?: number;
          currency?: string;
          duration_months?: number;
          study_level?: string;
          description?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          education_level: string | null;
          study_interests: string | null;
          phone_number: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          education_level?: string | null;
          study_interests?: string | null;
          phone_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          education_level?: string | null;
          study_interests?: string | null;
          phone_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      bookmarks: {
        Row: {
          id: number;
          user_id: string;
          program_id: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          program_id: number;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          program_id?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      JobOpportunity: {
        Row: {
          id: string;
          createdAt: string;
          department: string;
          funding_status: string;
          full_title: string;
          title: string;
          type: 'PHD' | 'JOB';
          isPhd: boolean | null;
          isJob: boolean | null;
          company: string;
          country: string;
          city: string;
          description: string;
          requirements: string[];
          deadline: string | null;
          postedAt: string;
          applicationLink: string;
          source: string;
        };
        Insert: {
          id?: string;
          createdAt?: string;
          department: string;
          funding_status: string;
          full_title: string;
          title: string;
          type: 'PHD' | 'JOB';
          isPhd?: boolean | null;
          isJob?: boolean | null;
          company: string;
          country: string;
          city: string;
          description: string;
          requirements: string[];
          deadline?: string | null;
          postedAt: string;
          applicationLink: string;
          source: string;
        };
        Update: {
          id?: string;
          createdAt?: string;
          department?: string;
          funding_status?: string;
          full_title?: string;
          title?: string;
          type?: 'PHD' | 'JOB';
          isPhd?: boolean | null;
          isJob?: boolean | null;
          company?: string;
          country?: string;
          city?: string;
          description?: string;
          requirements?: string[];
          deadline?: string | null;
          postedAt?: string;
          applicationLink?: string;
          source?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Program = Database['public']['Tables']['programs']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Bookmark = Database['public']['Tables']['bookmarks']['Row'];
export type JobOpportunity = Database['public']['Tables']['JobOpportunity']['Row'];
